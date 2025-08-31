#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release
use rmcp::model as mcp;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{RoleServer, Service as McpService};
use std::{collections::HashMap, fs, sync::OnceLock};
use tauri::Manager;

use mcp_bouncer::client::{ensure_rmcp_client, fetch_tools_for_cfg, registry_names, remove_rmcp_client};
use mcp_bouncer::config::{
    config_dir, default_settings, load_clients_state, load_settings, save_clients_state,
    save_settings, ClientStatus, IncomingClient, MCPServerConfig, Settings,
};
use mcp_bouncer::events::{client_error, client_status_changed, incoming_clients_updated, servers_updated, TauriEventEmitter};
use mcp_bouncer::app_logic;

// Types moved to config.rs

// ---------- Commands (initial stubs) ----------

// Config and client-state helpers moved to config.rs

// ---------- Streamable HTTP MCP proxy (basic) ----------

static PROXY_STARTED: OnceLock<()> = OnceLock::new();

fn spawn_mcp_proxy(app: &tauri::AppHandle) {
    if PROXY_STARTED.set(()).is_err() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        use axum::Router;
        // RMCP Streamable HTTP service bound at /mcp
        let service: StreamableHttpService<BouncerService, LocalSessionManager> =
            StreamableHttpService::new(
                move || {
                    Ok(BouncerService {
                        _app: app_handle.clone(),
                    })
                },
                Default::default(),
                StreamableHttpServerConfig {
                    stateful_mode: true,
                    sse_keep_alive: Some(std::time::Duration::from_secs(15)),
                },
            );
        let router = Router::new().nest_service("/mcp", service);
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .expect("bind 8091");
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("MCP server error: {e}");
        }
    });
}

// ---------- STDIO client management ----------
// No custom STDIO JSON-RPC client; STDIO is handled by rmcp via TokioChildProcess.

fn get_server_by_name(name: &str) -> Option<MCPServerConfig> {
    load_settings()
        .mcp_servers
        .into_iter()
        .find(|c| c.name == name)
}

// ---------------- RMCP Service Implementation ----------------

#[derive(Clone)]
struct BouncerService {
    _app: tauri::AppHandle,
}

impl McpService<RoleServer> for BouncerService {
    async fn handle_request(
        &self,
        request: mcp::ClientRequest,
        _context: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<mcp::ServerResult, mcp::ErrorData> {
        match request {
            mcp::ClientRequest::InitializeRequest(_req) => {
                let capabilities = mcp::ServerCapabilities::builder()
                    .enable_logging()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build();
                let result = mcp::InitializeResult {
                    protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                    capabilities,
                    server_info: mcp::Implementation {
                        name: "MCP Bouncer".into(),
                        version: env!("CARGO_PKG_VERSION").into(),
                    },
                    instructions: None,
                };
                Ok(mcp::ServerResult::InitializeResult(result))
            }
            mcp::ClientRequest::ListToolsRequest(_req) => {
                let s = load_settings();
                let mut tools: Vec<mcp::Tool> = Vec::new();
                for cfg in s.mcp_servers.into_iter().filter(|c| c.enabled) {
                    if let Ok(list) = fetch_tools_for_cfg(&cfg).await {
                        for item in list {
                            if let Some(t) = to_mcp_tool(&cfg.name, &item) {
                                tools.push(t);
                            }
                        }
                    }
                }
                Ok(mcp::ServerResult::ListToolsResult(mcp::ListToolsResult {
                    tools,
                    next_cursor: None,
                }))
            }
            mcp::ClientRequest::CallToolRequest(req) => {
                // Expect tool name like "server::tool"
                let name = req.params.name.to_string();
                let (server_name, tool_name) = name
                    .split_once("::")
                    .map(|(a, b)| (a.to_string(), b.to_string()))
                    .unwrap_or((String::new(), name.clone()));
                let args_obj = req
                    .params
                    .arguments
                    .clone()
                    .map(serde_json::Value::Object)
                    .and_then(|v| v.as_object().cloned());
                let cfg_opt = if !server_name.is_empty() {
                    get_server_by_name(&server_name)
                } else {
                    // default to first enabled HTTP/stdio server
                    load_settings().mcp_servers.into_iter().find(|c| c.enabled)
                };
                if let Some(cfg) = cfg_opt {
                    match ensure_rmcp_client(&cfg.name, &cfg).await {
                        Ok(client) => {
                            match client
                                .call_tool(mcp::CallToolRequestParam {
                                    name: tool_name.into(),
                                    arguments: args_obj,
                                })
                                .await
                            {
                                Ok(res) => Ok(mcp::ServerResult::CallToolResult(res)),
                                Err(e) => {
                                    Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                                        content: vec![mcp::Content::text(format!("error: {e}"))],
                                        structured_content: None,
                                        is_error: Some(true),
                                    }))
                                }
                            }
                        }
                        Err(e) => Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                            content: vec![mcp::Content::text(format!("error: {e}"))],
                            structured_content: None,
                            is_error: Some(true),
                        })),
                    }
                } else {
                    Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                        content: vec![mcp::Content::text("no server".to_string())],
                        structured_content: None,
                        is_error: Some(true),
                    }))
                }
            }
            other => {
                // For unhandled requests, return empty
                let _ = other; // silence
                Ok(mcp::ServerResult::empty(()))
            }
        }
    }

    async fn handle_notification(
        &self,
        _notification: mcp::ClientNotification,
        _context: rmcp::service::NotificationContext<RoleServer>,
    ) -> Result<(), mcp::ErrorData> {
        Ok(())
    }

    fn get_info(&self) -> mcp::ServerInfo {
        mcp::ServerInfo {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder()
                .enable_logging()
                .enable_tools()
                .enable_tool_list_changed()
                .build(),
            server_info: mcp::Implementation {
                name: "MCP Bouncer".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
            instructions: None,
        }
    }
}

fn to_mcp_tool(server: &str, v: &serde_json::Value) -> Option<mcp::Tool> {
    let name = v.get("name")?.as_str()?.to_string();
    let description = v
        .get("description")
        .and_then(|d| d.as_str())
        .map(|s| s.to_string());
    // input schema: try inputSchema or input_schema object
    let schema_obj = v
        .get("inputSchema")
        .or_else(|| v.get("input_schema"))
        .and_then(|s| s.as_object().cloned())
        .unwrap_or_default();
    let mut fullname = String::new();
    fullname.push_str(server);
    fullname.push_str("::");
    fullname.push_str(&name);
    Some(mcp::Tool::new(
        fullname,
        description.unwrap_or_default(),
        schema_obj,
    ))
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
    let reg_names = registry_names().await;
    let map = mcp_bouncer::status::compute_client_status_map(reg_names, |cfg: mcp_bouncer::config::MCPServerConfig| async move {
        fetch_tools_for_cfg(&cfg).await
    })
    .await;
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
    servers_updated(&TauriEventEmitter(app.clone()), "add");
    incoming_clients_updated(&TauriEventEmitter(app.clone()), "servers_changed");
    Ok(())
}

#[tauri::command]
async fn mcp_update_server(
    app: tauri::AppHandle,
    name: String,
    config: MCPServerConfig,
) -> Result<(), String> {
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
                client_error(&TauriEventEmitter(app.clone()), &name, "enable", &err);
                // update client state with last_error and auth_required
                let mut st = load_clients_state();
                let entry = st.0.entry(name.clone()).or_default();
                entry.last_error = Some("Authorization required".into());
                entry.authorization_required = Some(true);
                save_clients_state(&st)?;
                return Err("authorization required".into());
            }
        }

        let enabling = config.enabled;
        let server_name = item.name.clone();
        *item = config;
        let _ = item;
        save_settings(&s)?;
        // notify UI that servers changed first
        servers_updated(&TauriEventEmitter(app.clone()), "update");
        // try to connect if enabling
        if enabling {
            if let Some(cfg) = get_server_by_name(&server_name) {
                match ensure_rmcp_client(&server_name, &cfg).await {
                    Ok(_) => {
                        update_client_overlay_connected(&server_name, true)?;
                        client_status_changed(&TauriEventEmitter(app.clone()), &server_name, "enable");
                    }
                    Err(e) => {
                        set_client_overlay_error(&server_name, &e)?;
                        client_error(&TauriEventEmitter(app.clone()), &server_name, "enable", &e);
                    }
                }
            }
        }
        incoming_clients_updated(&TauriEventEmitter(app.clone()), "servers_changed");
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
    let _ = remove_rmcp_client(&name).await;
    servers_updated(&TauriEventEmitter(app.clone()), "remove");
    incoming_clients_updated(&TauriEventEmitter(app.clone()), "servers_changed");
    Ok(())
}

#[tauri::command]
async fn mcp_toggle_server_enabled(
    app: tauri::AppHandle,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let mut s = load_settings();
    if let Some(item) = s.mcp_servers.iter_mut().find(|c| c.name == name) {
        let server_name = item.name.clone();
        item.enabled = enabled;
        let _ = item;
        save_settings(&s)?;
        // notify UI that servers changed first
        servers_updated(&TauriEventEmitter(app.clone()), "toggle");
        if enabled {
            if let Some(cfg) = get_server_by_name(&server_name) {
                match ensure_rmcp_client(&server_name, &cfg).await {
                    Ok(_) => {
                        update_client_overlay_connected(&server_name, true)?;
                        client_status_changed(&TauriEventEmitter(app.clone()), &server_name, "enable");
                    }
                    Err(e) => {
                        set_client_overlay_error(&server_name, &e)?;
                        client_error(&TauriEventEmitter(app.clone()), &server_name, "enable", &e);
                    }
                }
            }
        } else {
            let _ = remove_rmcp_client(&server_name).await;
            update_client_overlay_connected(&server_name, false)?;
            client_status_changed(&TauriEventEmitter(app.clone()), &server_name, "disable");
        }
        servers_updated(&TauriEventEmitter(app.clone()), "toggle");
        incoming_clients_updated(&TauriEventEmitter(app.clone()), "servers_changed");
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
            client_error(&TauriEventEmitter(app.clone()), &name, "restart", "server not found");
            return Err("server not found".into());
        }
        Some(cfg) if !cfg.enabled => {
            client_error(&TauriEventEmitter(app.clone()), &name, "restart", "server is disabled");
            return Err("server is disabled".into());
        }
        _ => {}
    }

    // Ensure client exists; mark connected
    if let Some(cfg) = get_server_by_name(&name) {
        let _ = ensure_rmcp_client(&name, &cfg).await;
    }
    update_client_overlay_connected(&name, true)?;
    client_status_changed(&TauriEventEmitter(app.clone()), &name, "restart");
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
    client_status_changed(&TauriEventEmitter(app.clone()), &name, "authorize");
    Ok(())
}

#[tauri::command]
async fn mcp_get_client_tools(client_name: String) -> Result<Vec<serde_json::Value>, String> {
    if let Some(cfg) = get_server_by_name(&client_name) {
        let client = ensure_rmcp_client(&cfg.name, &cfg).await?;
        let tools = client
            .list_all_tools()
            .await
            .map_err(|e| format!("rmcp list tools: {e}"))?;
        let vals: Vec<serde_json::Value> = tools
            .into_iter()
            .map(|t| serde_json::to_value(t).unwrap_or(serde_json::json!({})))
            .collect();
        return Ok(vals);
    }
    Ok(Vec::new())
}

fn update_client_overlay_connected(name: &str, connected: bool) -> Result<(), String> {
    let mut state = load_clients_state();
    let entry = state.0.entry(name.to_string()).or_default();
    entry.connected = Some(connected);
    if connected {
        entry.last_error = None;
    }
    save_clients_state(&state)
}

fn set_client_overlay_error(name: &str, err: &str) -> Result<(), String> {
    let mut state = load_clients_state();
    let entry = state.0.entry(name.to_string()).or_default();
    entry.last_error = Some(err.to_string());
    save_clients_state(&state)
}

// No legacy mcp_rpc/mcp_proxy_request commands; HTTP path handled by rmcp client where needed.

#[tauri::command]
async fn mcp_toggle_tool(
    client_name: String,
    tool_name: String,
    enabled: bool,
) -> Result<(), String> {
    mcp_bouncer::config::save_tools_toggle_with(&mcp_bouncer::config::OsConfigProvider, &client_name, &tool_name, enabled)
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
async fn settings_update_settings(
    app: tauri::AppHandle,
    settings: Option<Settings>,
) -> Result<(), String> {
    let s = settings.unwrap_or_else(default_settings);
    app_logic::update_settings(&mcp_bouncer::config::OsConfigProvider, &TauriEventEmitter(app), s)
}

fn main() {
    tauri::Builder::default()
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // start the proxy server (idempotent)
            spawn_mcp_proxy(app.app_handle());
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
            settings_get_settings,
            settings_open_config_directory,
            settings_update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
