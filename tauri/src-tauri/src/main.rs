#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use axum::{extract::State, http::{HeaderMap, StatusCode, Response}, body::Body as AxumBody};
use bytes::Bytes;
use futures::future::join_all;
use std::{collections::HashMap, fs, path::PathBuf, sync::{Arc, OnceLock}};
use tokio::io::{AsyncWriteExt, AsyncBufReadExt};

// ---------- Shared types (mirror of previous Wails bindings) ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    #[serde(rename = "stdio")]
    TransportStdio,
    #[serde(rename = "sse")]
    TransportSSE,
    #[serde(rename = "streamable_http")]
    TransportStreamableHTTP,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub name: String,
    pub description: String,
    pub transport: Option<TransportType>,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub endpoint: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub requires_auth: Option<bool>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub mcp_servers: Vec<MCPServerConfig>,
    pub listen_addr: String,
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientStatus {
    pub name: String,
    pub connected: bool,
    pub tools: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub authorization_required: bool,
    pub oauth_authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingClient {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<String>,
}

// ---------- Commands (initial stubs) ----------

fn config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default());
    base.join("mcp-bouncer")
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

fn default_settings() -> Settings {
    Settings {
        mcp_servers: Vec::new(),
        listen_addr: "http://localhost:8091/mcp".to_string(),
        auto_start: false,
    }
}

fn load_settings() -> Settings {
    let path = settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&content) {
            return s;
        }
    }
    default_settings()
}

fn save_settings(settings: &Settings) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create config dir: {e}"))?;
    let path = settings_path();
    let content = serde_json::to_string_pretty(settings).map_err(|e| format!("to json: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("write settings: {e}"))
}

// ---------- Client state overlay (persisted) ----------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ClientState {
    connected: Option<bool>,
    last_error: Option<String>,
    authorization_required: Option<bool>,
    oauth_authenticated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ClientsState(HashMap<String, ClientState>);

fn clients_state_path() -> PathBuf {
    config_dir().join("clients_state.json")
}

fn load_clients_state() -> ClientsState {
    fs::read_to_string(clients_state_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_clients_state(state: &ClientsState) -> Result<(), String> {
    fs::create_dir_all(config_dir()).map_err(|e| format!("create dir: {e}"))?;
    let content = serde_json::to_string_pretty(state).map_err(|e| format!("to json: {e}"))?;
    fs::write(clients_state_path(), content).map_err(|e| format!("write clients state: {e}"))
}

// ---------- Streamable HTTP MCP proxy (basic) ----------

#[derive(Clone)]
struct ProxyState {
    app: tauri::AppHandle,
}

static PROXY_STARTED: OnceLock<()> = OnceLock::new();
static STDIO_REGISTRY: OnceLock<tokio::sync::Mutex<HashMap<String, Arc<StdioClient>>>> = OnceLock::new();

fn spawn_mcp_proxy(app: &tauri::AppHandle) {
    if PROXY_STARTED.set(()).is_err() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        use axum::{routing::post, Router};
        let state = ProxyState { app: app_handle.clone() };
        let router = Router::new()
            .route("/mcp", post(proxy_mcp))
            .with_state(state);
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
        let listener = tokio::net::TcpListener::bind(addr).await.expect("bind 8091");
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("MCP proxy server error: {e}");
        }
    });
}

// ---------- STDIO client management ----------

struct StdioClient {
    writer: tokio::sync::Mutex<tokio::process::ChildStdin>,
    reader: tokio::sync::Mutex<tokio::io::BufReader<tokio::process::ChildStdout>>,
}

async fn ensure_stdio_client(name: &str, cfg: &MCPServerConfig) -> Result<Arc<StdioClient>, String> {
    let reg = STDIO_REGISTRY.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()));
    let mut guard = reg.lock().await;
    if let Some(c) = guard.get(name) {
        return Ok(c.clone());
    }
    let cmd = cfg.command.clone();
    if cmd.is_empty() { return Err("missing command".into()); }
    let mut command = tokio::process::Command::new(cmd);
    if let Some(args) = &cfg.args { command.args(args); }
    if let Some(envmap) = &cfg.env { command.envs(envmap.clone()); }
    command.stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped());
    let mut child = command.spawn().map_err(|e| format!("spawn: {e}"))?;
    let stdin = child.stdin.take().ok_or("no child stdin")?;
    let stdout = child.stdout.take().ok_or("no child stdout")?;
    let client = Arc::new(StdioClient {
        writer: tokio::sync::Mutex::new(stdin),
        reader: tokio::sync::Mutex::new(tokio::io::BufReader::new(stdout)),
    });
    guard.insert(name.to_string(), client.clone());
    Ok(client)
}

async fn stdio_rpc(name: &str, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = get_server_by_name(name).ok_or_else(|| "server not found".to_string())?;
    let Some(TransportType::TransportStdio) = cfg.transport else { return Err("not stdio".into()); };
    let client = ensure_stdio_client(name, &cfg).await?;
    // Write one JSON-RPC line and read one line back
    let req = serde_json::json!({"jsonrpc":"2.0","id":"1","method":method,"params":params});
    let mut writer = client.writer.lock().await;
    let line = serde_json::to_string(&req).map_err(|e| format!("json: {e}"))? + "\n";
    writer.write_all(line.as_bytes()).await.map_err(|e| format!("write: {e}"))?;
    writer.flush().await.map_err(|e| format!("flush: {e}"))?;
    drop(writer);

    let mut reader = client.reader.lock().await;
    let mut buf = String::new();
    let n = reader.read_line(&mut buf).await.map_err(|e| format!("read: {e}"))?;
    if n == 0 { return Err("stdio client closed".into()); }
    let v: serde_json::Value = serde_json::from_str(&buf).map_err(|e| format!("parse: {e}; buf={buf}"))?;
    Ok(v)
}

#[derive(Clone)]
struct Upstream {
    url: String,
    headers: HashMap<String, String>,
}

fn select_upstream_by_name(name: &str) -> Option<Upstream> {
    let s = load_settings();
    s.mcp_servers
        .into_iter()
        .find(|c| c.name == name && c.enabled)
        .and_then(|c| match c.transport {
            Some(TransportType::TransportStreamableHTTP) => Some(Upstream {
                url: c.endpoint.unwrap_or_default(),
                headers: c.headers.unwrap_or_default(),
            }),
            _ => None,
        })
}

fn select_default_upstream() -> Option<Upstream> {
    let s = load_settings();
    s.mcp_servers
        .into_iter()
        .find(|c| c.enabled && matches!(c.transport, Some(TransportType::TransportStreamableHTTP)))
        .map(|c| Upstream {
            url: c.endpoint.unwrap_or_default(),
            headers: c.headers.unwrap_or_default(),
        })
}

fn get_server_by_name(name: &str) -> Option<MCPServerConfig> {
    load_settings().mcp_servers.into_iter().find(|c| c.name == name)
}

async fn proxy_mcp(
    State(state): State<ProxyState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response<AxumBody>, StatusCode> {
    let mut server_name: Option<String> = None;
    for (k, v) in headers.iter() {
        if k.as_str().eq_ignore_ascii_case("x-mcp-server") {
            server_name = v.to_str().ok().map(|s| s.to_string());
            break;
        }
    }
    let upstream = if let Some(name) = server_name {
        select_upstream_by_name(&name)
    } else {
        select_default_upstream()
    };
    let Some(up) = upstream else {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    };

    let client = reqwest::Client::new();
    let mut rb = client.post(&up.url);
    for (k, v) in &up.headers {
        rb = rb.header(k, v);
    }
    let res = match rb.header("content-type", "application/json").body(body).send().await {
        Ok(r) => r,
        Err(_) => return Err(StatusCode::BAD_GATEWAY),
    };

    // Emit a coarse incoming update
    let _ = state
        .app
        .emit("mcp:incoming_clients_updated", &serde_json::json!({"reason":"proxy_request"}));

    let status = StatusCode::from_u16(res.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut resp_builder = Response::builder().status(status);
    for (k, v) in res.headers().iter() {
        if let Ok(val) = v.to_str() { resp_builder = resp_builder.header(k.as_str(), val); }
    }
    let bytes = res.bytes().await.unwrap_or_default();
    Ok(resp_builder.body(AxumBody::from(bytes)).unwrap())
}

#[tauri::command]
async fn mcp_list() -> Result<Vec<MCPServerConfig>, String> {
    Ok(load_settings().mcp_servers)
}

#[tauri::command]
async fn mcp_listen_addr() -> Result<String, String> {
    Ok(load_settings().listen_addr)
}

#[tauri::command]
async fn mcp_is_active() -> Result<bool, String> {
    let s = load_settings();
    Ok(!s.mcp_servers.is_empty())
}

#[tauri::command]
async fn mcp_get_client_status() -> Result<HashMap<String, ClientStatus>, String> {
    let s = load_settings();
    let mut map = HashMap::new();
    // build defaults and plan streamable fetches
    let mut tasks = Vec::new();
    for server in s.mcp_servers {
        let name = server.name.clone();
        let transport = server.transport.clone();
        let enabled = server.enabled;
        map.insert(
            name.clone(),
            ClientStatus {
                name: name.clone(),
                connected: false,
                tools: 0,
                last_error: None,
                authorization_required: server.requires_auth.unwrap_or(false),
                oauth_authenticated: false,
            },
        );
        if enabled && matches!(transport, Some(TransportType::TransportStreamableHTTP)) {
            tasks.push(async move {
                let cfg_opt = get_server_by_name(&name);
                if let Some(cfg) = cfg_opt {
                    if let Some(tools) = fetch_tools_for_cfg(&cfg).await.ok() {
                        return Some((name, tools.len() as u32));
                    }
                }
                None
            });
        }
    }
    // execute tools fetches
    let results = join_all(tasks).await;
    for r in results.into_iter().flatten() {
        if let Some(cs) = map.get_mut(&r.0) {
            cs.tools = r.1;
        }
    }
    // overlay from persisted clients_state
    let overlay = load_clients_state();
    for (name, state) in overlay.0.into_iter() {
        if let Some(cs) = map.get_mut(&name) {
            if let Some(v) = state.connected { cs.connected = v; }
            if state.last_error.is_some() { cs.last_error = state.last_error; }
            if let Some(v) = state.authorization_required { cs.authorization_required = v; }
            if let Some(v) = state.oauth_authenticated { cs.oauth_authenticated = v; }
        }
    }
    Ok(map)
}

#[tauri::command]
async fn mcp_get_incoming_clients() -> Result<Vec<IncomingClient>, String> {
    Ok(Vec::new())
}

#[tauri::command]
async fn mcp_add_server(app: tauri::AppHandle, config: MCPServerConfig) -> Result<(), String> {
    let mut s = load_settings();
    if s.mcp_servers.iter().any(|c| c.name == config.name) {
        return Err("server with that name already exists".into());
    }
    s.mcp_servers.push(config);
    save_settings(&s)?;
    let _ = app.emit("mcp:servers_updated", &serde_json::json!({"reason":"add"}));
    let _ = app.emit("mcp:incoming_clients_updated", &serde_json::json!({"reason":"servers_changed"}));
    Ok(())
}

#[tauri::command]
async fn mcp_update_server(app: tauri::AppHandle, name: String, config: MCPServerConfig) -> Result<(), String> {
    let mut s = load_settings();
    if let Some(item) = s.mcp_servers.iter_mut().find(|c| c.name == name) {
        // Simulate an auth error when enabling a server that requires auth but is not authorized
        let requires_auth = config.requires_auth.unwrap_or(false);
        let is_enabling = config.enabled;
        if requires_auth && is_enabling {
            let clients = load_clients_state();
            let oauth_ok = clients
                .0
                .get(&name)
                .and_then(|st| st.oauth_authenticated)
                .unwrap_or(false);
            if !oauth_ok {
                let err = "Authorization required".to_string();
                // emit client error
                let _ = app.emit(
                    "mcp:client_error",
                    &serde_json::json!({
                        "server_name": name,
                        "action": "enable",
                        "error": err,
                    }),
                );
                // update client state with last_error and auth_required
                let mut st = load_clients_state();
                let entry = st.0.entry(name.clone()).or_default();
                entry.last_error = Some("Authorization required".into());
                entry.authorization_required = Some(true);
                save_clients_state(&st)?;
                return Err("authorization required".into());
            }
        }

        *item = config;
        save_settings(&s)?;
        let _ = app.emit("mcp:servers_updated", &serde_json::json!({"reason":"update"}));
        let _ = app.emit("mcp:incoming_clients_updated", &serde_json::json!({"reason":"servers_changed"}));
        Ok(())
    } else {
        Err("server not found".into())
    }
}

#[tauri::command]
async fn mcp_remove_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let mut s = load_settings();
    let before = s.mcp_servers.len();
    s.mcp_servers.retain(|c| c.name != name);
    if s.mcp_servers.len() == before {
        return Err("server not found".into());
    }
    save_settings(&s)?;
    let _ = app.emit("mcp:servers_updated", &serde_json::json!({"reason":"remove"}));
    let _ = app.emit("mcp:incoming_clients_updated", &serde_json::json!({"reason":"servers_changed"}));
    Ok(())
}

#[tauri::command]
async fn mcp_toggle_server_enabled(app: tauri::AppHandle, name: String, enabled: bool) -> Result<(), String> {
    let mut s = load_settings();
    if let Some(item) = s.mcp_servers.iter_mut().find(|c| c.name == name) {
        item.enabled = enabled;
        save_settings(&s)?;
        let _ = app.emit("mcp:servers_updated", &serde_json::json!({"reason":"toggle"}));
        let _ = app.emit("mcp:incoming_clients_updated", &serde_json::json!({"reason":"servers_changed"}));
        Ok(())
    } else {
        Err("server not found".into())
    }
}

#[tauri::command]
async fn mcp_restart_client(app: tauri::AppHandle, name: String) -> Result<(), String> {
    // If server doesn't exist or is disabled, emit client_error
    let s = load_settings();
    let srv = s.mcp_servers.iter().find(|c| c.name == name).cloned();
    match srv {
        None => {
            let _ = app.emit(
                "mcp:client_error",
                &serde_json::json!({"server_name": name, "action":"restart", "error":"server not found"}),
            );
            return Err("server not found".into());
        }
        Some(cfg) if !cfg.enabled => {
            let _ = app.emit(
                "mcp:client_error",
                &serde_json::json!({"server_name": name, "action":"restart", "error":"server is disabled"}),
            );
            return Err("server is disabled".into());
        }
        _ => {}
    }

    // Simulate a restart: set connected=true and clear last_error
    let mut state = load_clients_state();
    let entry = state.0.entry(name.clone()).or_default();
    entry.connected = Some(true);
    entry.last_error = None;
    save_clients_state(&state)?;
    let _ = app.emit(
        "mcp:client_status_changed",
        &serde_json::json!({"server_name": name, "action":"restart"}),
    );
    Ok(())
}

#[tauri::command]
async fn mcp_authorize_client(app: tauri::AppHandle, name: String) -> Result<(), String> {
    // Simulate successful OAuth: set oauth_authenticated=true and authorization_required=false
    let mut state = load_clients_state();
    let entry = state.0.entry(name.clone()).or_default();
    entry.oauth_authenticated = Some(true);
    entry.authorization_required = Some(false);
    save_clients_state(&state)?;
    let _ = app.emit("mcp:client_status_changed", &serde_json::json!({"server_name": name, "action":"authorize"}));
    Ok(())
}

#[tauri::command]
async fn mcp_get_client_tools(client_name: String) -> Result<Vec<serde_json::Value>, String> {
    if let Some(cfg) = get_server_by_name(&client_name) {
        let tools = fetch_tools_for_cfg(&cfg).await.unwrap_or_default();
        return Ok(tools);
    }
    Ok(Vec::new())
}

async fn fetch_tools_for_cfg(cfg: &MCPServerConfig) -> Result<Vec<serde_json::Value>, String> {
    if matches!(cfg.transport, Some(TransportType::TransportStdio)) {
        let v = stdio_rpc(&cfg.name, "tools/list", serde_json::json!({})).await?;
        if let Some(arr) = v.get("result").and_then(|r| r.get("tools")).and_then(|t| t.as_array()) { return Ok(arr.clone()); }
        if let Some(arr) = v.get("tools").and_then(|t| t.as_array()) { return Ok(arr.clone()); }
        if let Some(arr) = v.as_array() { return Ok(arr.clone()); }
        return Ok(Vec::new());
    }
    if !matches!(cfg.transport, Some(TransportType::TransportStreamableHTTP)) {
        return Ok(vec![]);
    }
    let endpoint = cfg.endpoint.clone().unwrap_or_default();
    if endpoint.is_empty() { return Ok(Vec::new()); }
    let headers = cfg.headers.clone().unwrap_or_default();
    let client = reqwest::Client::new();
    let mut rb = client.post(endpoint);
    for (k, v) in headers.iter() { rb = rb.header(k, v); }
    let body = serde_json::json!({"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}});
    let res = rb.json(&body).send().await.map_err(|e| format!("request: {e}"))?;
    let status = res.status();
    let json: serde_json::Value = res.json().await.map_err(|e| format!("parse: {e}"))?;
    if !status.is_success() { return Err(format!("upstream {}: {:?}", status, json)); }
    if let Some(arr) = json.get("result").and_then(|r| r.get("tools")).and_then(|t| t.as_array()) { return Ok(arr.clone()); }
    if let Some(arr) = json.get("tools").and_then(|t| t.as_array()) { return Ok(arr.clone()); }
    if let Some(arr) = json.as_array() { return Ok(arr.clone()); }
    Ok(Vec::new())
}

#[tauri::command]
async fn mcp_rpc(name: String, method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let Some(cfg) = get_server_by_name(&name) else { return Err("server not found".into()); };
    match cfg.transport {
        Some(TransportType::TransportStreamableHTTP) => {
            let endpoint = cfg.endpoint.unwrap_or_default();
            if endpoint.is_empty() { return Err("no endpoint".into()); }
            let headers = cfg.headers.unwrap_or_default();
            let client = reqwest::Client::new();
            let mut rb = client.post(endpoint);
            for (k, v) in headers.iter() { rb = rb.header(k, v); }
            let body = serde_json::json!({"jsonrpc":"2.0","id":"1","method":method,"params":params});
            let res = rb.json(&body).send().await.map_err(|e| format!("request: {e}"))?;
            let status = res.status();
            let json: serde_json::Value = res.json().await.map_err(|e| format!("parse: {e}"))?;
            if !status.is_success() { return Err(format!("upstream {}: {:?}", status, json)); }
            Ok(json)
        }
        Some(TransportType::TransportStdio) => {
            stdio_rpc(&name, &method, params).await
        }
        _ => Err("unsupported transport for rpc".into()),
    }
}

#[tauri::command]
async fn mcp_proxy_request(name: Option<String>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let cfg = if let Some(n) = name { get_server_by_name(&n) } else { select_default_upstream().and_then(|up| load_settings().mcp_servers.into_iter().find(|c| c.endpoint.as_deref() == Some(&up.url))) };
    let Some(cfg) = cfg else { return Err("server not found".into()); };
    match cfg.transport {
        Some(TransportType::TransportStreamableHTTP) => {
            let endpoint = cfg.endpoint.unwrap_or_default();
            if endpoint.is_empty() { return Err("no endpoint".into()); }
            let headers = cfg.headers.unwrap_or_default();
            let client = reqwest::Client::new();
            let mut rb = client.post(endpoint);
            for (k, v) in headers.iter() { rb = rb.header(k, v); }
            let res = rb.json(&payload).send().await.map_err(|e| format!("request: {e}"))?;
            let status = res.status();
            let json: serde_json::Value = res.json().await.map_err(|e| format!("parse: {e}"))?;
            if !status.is_success() { return Err(format!("upstream {}: {:?}", status, json)); }
            Ok(json)
        }
        Some(TransportType::TransportStdio) => {
            // Expect payload as a full JSON-RPC object with method/params
            let method = payload.get("method").and_then(|v| v.as_str()).ok_or("missing method")?.to_string();
            let params = payload.get("params").cloned().unwrap_or(serde_json::json!({}));
            stdio_rpc(&cfg.name, &method, params).await
        }
        _ => Err("unsupported transport for rpc".into()),
    }
}

#[tauri::command]
async fn mcp_toggle_tool(client_name: String, tool_name: String, enabled: bool) -> Result<(), String> {
    // Persist simple per-client enabled map in tools_state.json
    #[derive(Serialize, Deserialize, Default)]
    struct ToolsState(HashMap<String, HashMap<String, bool>>);

    let path = config_dir().join("tools_state.json");
    let mut state: ToolsState = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    state.0
        .entry(client_name)
        .or_default()
        .insert(tool_name, enabled);
    let content = serde_json::to_string_pretty(&state).map_err(|e| format!("to json: {e}"))?;
    fs::create_dir_all(config_dir()).map_err(|e| format!("create dir: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("write tools state: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn settings_get_settings() -> Result<Option<Settings>, String> {
    Ok(Some(load_settings()))
}

#[tauri::command]
async fn settings_open_config_directory() -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    open::that_detached(&dir).map_err(|e| format!("open dir: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn settings_update_settings(app: tauri::AppHandle, settings: Option<Settings>) -> Result<(), String> {
    let s = settings.unwrap_or_else(default_settings);
    save_settings(&s)?;
    let _ = app.emit("settings:updated", &serde_json::json!({"reason":"update"}));
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // start the proxy server (idempotent)
            spawn_mcp_proxy(&app.app_handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp_list,
            mcp_listen_addr,
            mcp_is_active,
            mcp_get_client_status,
            mcp_get_incoming_clients,
            mcp_add_server,
            mcp_update_server,
            mcp_remove_server,
            mcp_toggle_server_enabled,
            mcp_restart_client,
            mcp_authorize_client,
            mcp_get_client_tools,
            mcp_toggle_tool,
            mcp_rpc,
            mcp_proxy_request,
            settings_get_settings,
            settings_open_config_directory,
            settings_update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
