use std::collections::HashMap;

use mcp_bouncer::BIN_NAME_SOCKET_PROXY;
use mcp_bouncer::client::{ensure_rmcp_client, fetch_tools_for_cfg, remove_rmcp_client};
use mcp_bouncer::config::{
    ClientConnectionState, ClientStatus, ConfigProvider, IncomingClient, MCPServerConfig,
    ServerTransport, Settings, config_dir, default_settings, load_settings, save_settings,
    save_settings_with,
};
use mcp_bouncer::events::{
    EventEmitter, TauriEventEmitter, client_error, client_status_changed, servers_updated,
    settings_updated,
};
use mcp_bouncer::incoming::list_incoming;
use mcp_bouncer::logging::{Event, RpcEventPublisher, SqlitePublisher, with_request_origin};
use mcp_bouncer::oauth::{self, start_oauth_for_server};
use mcp_bouncer::server::get_runtime_listen_addr;
use mcp_bouncer::types::ToolInfo;
use rmcp::{ServiceError, model as mcp};
use serde::Serialize;
use serde_json::{Value as JsonValue, json};
use specta::Type;

#[derive(serde::Serialize, Type)]
pub struct DebugCallToolResponse {
    pub duration_ms: f64,
    pub ok: bool,
    pub result: JsonValue,
    #[specta(optional)]
    pub request_arguments: Option<JsonValue>,
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_list() -> Result<Vec<MCPServerConfig>, String> {
    Ok(load_settings().mcp_servers)
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_listen_addr() -> Result<String, String> {
    let settings = load_settings();
    match settings.transport {
        ServerTransport::Tcp => {
            if let Some(addr) = get_runtime_listen_addr() {
                Ok(format!("http://{}:{}/mcp", addr.ip(), addr.port()))
            } else {
                Ok(settings.listen_addr)
            }
        }
        ServerTransport::Unix => Ok("/tmp/mcp-bouncer.sock".to_string()),
        ServerTransport::Stdio => Ok("stdio".to_string()),
    }
}

#[derive(Serialize, Type)]
pub struct SocketBridgeInfo {
    pub path: String,
    pub exists: bool,
}

impl SocketBridgeInfo {
    fn new(path: std::path::PathBuf, exists: bool) -> Self {
        Self {
            path: path.to_string_lossy().into_owned(),
            exists,
        }
    }
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_socket_bridge_path(
    _app: tauri::AppHandle,
) -> Result<Option<SocketBridgeInfo>, String> {
    let settings = load_settings();
    if settings.transport != ServerTransport::Unix {
        return Ok(None);
    }

    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            candidates.push(dir.join(BIN_NAME_SOCKET_PROXY));
        }
    }

    if cfg!(debug_assertions) {
        if let Some(dev_path) = dev_socket_proxy_path() {
            candidates.push(dev_path);
        }
    }

    if candidates.is_empty() {
        return Ok(None);
    }

    let mut tagged: Vec<(std::path::PathBuf, bool)> = candidates
        .into_iter()
        .map(|path| {
            let exists = path.exists();
            (path, exists)
        })
        .collect();

    if let Some((path, _)) = tagged.iter().find(|(_, exists)| *exists) {
        return Ok(Some(SocketBridgeInfo::new(path.clone(), true)));
    }

    let (path, exists) = tagged.remove(0);
    Ok(Some(SocketBridgeInfo::new(path, exists)))
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_is_active() -> Result<bool, String> {
    let s = load_settings();
    Ok(!s.mcp_servers.is_empty())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_get_client_status() -> Result<HashMap<String, ClientStatus>, String> {
    Ok(mcp_bouncer::status::compute_client_status_map().await)
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_get_incoming_clients() -> Result<Vec<IncomingClient>, String> {
    Ok(list_incoming().await)
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_add_server(app: tauri::AppHandle, config: MCPServerConfig) -> Result<(), String> {
    let mut s = load_settings();
    if s.mcp_servers.iter().any(|c| c.name == config.name) {
        return Err("server with that name already exists".into());
    }
    let server_name = config.name.clone();
    let should_connect = config.enabled;
    s.mcp_servers.push(config);
    save_settings(&s)?;
    notify_servers_changed(&TauriEventEmitter(app.clone()), "add");
    if should_connect && let Some(cfg) = get_server_by_name(&server_name) {
        if matches!(
            cfg.transport,
            mcp_bouncer::config::TransportType::StreamableHttp
        ) && cfg.requires_auth
            && mcp_bouncer::oauth::load_credentials_for(
                &mcp_bouncer::config::OsConfigProvider,
                &server_name,
            )
            .is_none()
        {
            mcp_bouncer::overlay::mark_unauthorized(&server_name).await;
            client_status_changed(
                &TauriEventEmitter(app.clone()),
                &server_name,
                "requires_authorization",
            );
        } else {
            connect_and_initialize(&TauriEventEmitter(app.clone()), &server_name, &cfg).await;
        }
    }
    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_update_server(
    app: tauri::AppHandle,
    name: String,
    config: MCPServerConfig,
) -> Result<(), String> {
    let mut s = load_settings();
    if let Some(item) = s.mcp_servers.iter_mut().find(|c| c.name == name) {
        let enabling = config.enabled;
        let server_name = item.name.clone();
        *item = config;
        save_settings(&s)?;
        notify_servers_changed(&TauriEventEmitter(app.clone()), "update");
        if enabling {
            if let Some(cfg) = get_server_by_name(&server_name) {
                if matches!(
                    cfg.transport,
                    mcp_bouncer::config::TransportType::StreamableHttp
                ) && cfg.requires_auth
                    && mcp_bouncer::oauth::load_credentials_for(
                        &mcp_bouncer::config::OsConfigProvider,
                        &server_name,
                    )
                    .is_none()
                {
                    mcp_bouncer::overlay::mark_unauthorized(&server_name).await;
                    client_status_changed(
                        &TauriEventEmitter(app.clone()),
                        &server_name,
                        "requires_authorization",
                    );
                } else {
                    connect_and_initialize(&TauriEventEmitter(app.clone()), &server_name, &cfg)
                        .await;
                }
            }
        } else {
            let _ = remove_rmcp_client(&server_name).await;
            mcp_bouncer::overlay::set_state(&server_name, ClientConnectionState::Disconnected)
                .await;
            mcp_bouncer::overlay::set_error(&server_name, None).await;
            client_status_changed(&TauriEventEmitter(app.clone()), &server_name, "disable");
        }
        Ok(())
    } else {
        Err("server not found".into())
    }
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_remove_server(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let mut s = load_settings();
    let before = s.mcp_servers.len();
    s.mcp_servers.retain(|c| c.name != name);
    if s.mcp_servers.len() == before {
        return Err("server not found".into());
    }
    save_settings(&s)?;
    let _ = remove_rmcp_client(&name).await;
    mcp_bouncer::overlay::remove(&name).await;
    notify_servers_changed(&TauriEventEmitter(app.clone()), "remove");
    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_toggle_server_enabled(
    app: tauri::AppHandle,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let mut s = load_settings();
    if let Some(item) = s.mcp_servers.iter_mut().find(|c| c.name == name) {
        let server_name = item.name.clone();
        item.enabled = enabled;
        save_settings(&s)?;
        if enabled {
            if let Some(cfg) = get_server_by_name(&server_name) {
                if matches!(
                    cfg.transport,
                    mcp_bouncer::config::TransportType::StreamableHttp
                ) && cfg.requires_auth
                    && mcp_bouncer::oauth::load_credentials_for(
                        &mcp_bouncer::config::OsConfigProvider,
                        &server_name,
                    )
                    .is_none()
                {
                    mcp_bouncer::overlay::mark_unauthorized(&server_name).await;
                    client_status_changed(
                        &TauriEventEmitter(app.clone()),
                        &server_name,
                        "requires_authorization",
                    );
                } else {
                    connect_and_initialize(&TauriEventEmitter(app.clone()), &server_name, &cfg)
                        .await;
                }
            }
        } else {
            let _ = remove_rmcp_client(&server_name).await;
            mcp_bouncer::overlay::set_state(&server_name, ClientConnectionState::Disconnected)
                .await;
            mcp_bouncer::overlay::set_error(&server_name, None).await;
            client_status_changed(&TauriEventEmitter(app.clone()), &server_name, "disable");
        }
        notify_servers_changed(&TauriEventEmitter(app.clone()), "toggle");
        Ok(())
    } else {
        Err("server not found".into())
    }
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_restart_client(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let s = load_settings();
    let srv = s.mcp_servers.iter().find(|c| c.name == name).cloned();
    match srv {
        None => {
            client_error(
                &TauriEventEmitter(app.clone()),
                &name,
                "restart",
                "server not found",
            );
            return Err("server not found".into());
        }
        Some(cfg) if !cfg.enabled => {
            client_error(
                &TauriEventEmitter(app.clone()),
                &name,
                "restart",
                "server is disabled",
            );
            return Err("server is disabled".into());
        }
        _ => {}
    }

    if let Some(cfg) = get_server_by_name(&name) {
        connect_and_initialize(&TauriEventEmitter(app.clone()), &name, &cfg).await;
    }
    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_start_oauth(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let cfg = get_server_by_name(&name).ok_or_else(|| "server not found".to_string())?;
    let endpoint = cfg.endpoint.clone();
    if endpoint.is_empty() {
        return Err("missing endpoint".to_string());
    }
    mcp_bouncer::overlay::set_state(&name, ClientConnectionState::Authorizing).await;
    let emitter = TauriEventEmitter(app.clone());
    client_status_changed(&emitter, &name, "authorizing");
    let logger = SqlitePublisher;
    start_oauth_for_server(&emitter, &logger, &name, &endpoint)
        .await
        .map_err(|e| e.to_string())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_get_client_tools(
    app: tauri::AppHandle,
    client_name: String,
) -> Result<Vec<ToolInfo>, String> {
    let list = mcp_bouncer::tools_cache::get(&client_name)
        .await
        .unwrap_or_default();
    let needs_schema = list.is_empty() || list.iter().any(|t| t.input_schema.is_none());
    if needs_schema {
        return fetch_and_cache_tools(&app, &client_name).await;
    }
    Ok(mcp_bouncer::tools_cache::filter_enabled_with(
        &mcp_bouncer::config::OsConfigProvider,
        &client_name,
        list,
    ))
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_refresh_client_tools(
    app: tauri::AppHandle,
    client_name: String,
) -> Result<(), String> {
    fetch_and_cache_tools(&app, &client_name).await.map(|_| ())
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_debug_call_tool(
    app: tauri::AppHandle,
    server_name: String,
    tool_name: String,
    args: Option<JsonValue>,
) -> Result<DebugCallToolResponse, String> {
    let cfg = get_server_by_name(&server_name).ok_or_else(|| "server not found".to_string())?;
    if !cfg.enabled {
        return Err("server is disabled".into());
    }
    let overlay_snapshot = mcp_bouncer::overlay::snapshot().await;
    let is_connected = overlay_snapshot
        .get(&server_name)
        .map(|entry| entry.state == ClientConnectionState::Connected)
        .unwrap_or(false);
    if !is_connected {
        return Err("server is not connected".into());
    }

    let args_map = match args {
        Some(JsonValue::Object(map)) => Some(map),
        Some(JsonValue::Null) => None,
        Some(_) => return Err("tool arguments must be a JSON object".into()),
        None => None,
    };
    let request_arguments = args_map.as_ref().map(|m| JsonValue::Object(m.clone()));

    let emitter = TauriEventEmitter(app.clone());
    let logger = SqlitePublisher;
    let client = ensure_rmcp_client(&server_name, &cfg, &emitter, &logger)
        .await
        .map_err(|e| e.to_string())?;

    let call_client = client.clone();
    let args_for_call = args_map.clone();
    let tool_for_call = tool_name.clone();
    let start = std::time::Instant::now();
    let result = with_request_origin("debugger", move || {
        let call_client = call_client.clone();
        let args_for_call = args_for_call.clone();
        let tool_for_call = tool_for_call.clone();
        async move {
            call_client
                .call_tool(mcp::CallToolRequestParam {
                    name: tool_for_call.into(),
                    arguments: args_for_call,
                })
                .await
        }
    })
    .await;
    let duration_ms = (start.elapsed().as_secs_f64() * 1_000.0).round();

    match result {
        Ok(call_result) => {
            let ok = call_result.is_error != Some(true);
            let result_json = serde_json::to_value(&call_result).map_err(|e| e.to_string())?;
            Ok(DebugCallToolResponse {
                duration_ms,
                ok,
                result: result_json,
                request_arguments,
            })
        }
        Err(service_error) => {
            let payload = match &service_error {
                ServiceError::McpError(error) => build_debug_call_error_payload(error),
                other => build_debug_call_service_error_payload(other),
            };
            Ok(DebugCallToolResponse {
                duration_ms,
                ok: false,
                result: payload,
                request_arguments,
            })
        }
    }
}

#[specta::specta]
#[tauri::command]
pub async fn mcp_toggle_tool(
    client_name: String,
    tool_name: String,
    enabled: bool,
) -> Result<(), String> {
    mcp_bouncer::config::save_tools_toggle_with(
        &mcp_bouncer::config::OsConfigProvider,
        &client_name,
        &tool_name,
        enabled,
    )
}

#[specta::specta]
#[tauri::command]
pub async fn settings_get_settings() -> Result<Option<Settings>, String> {
    Ok(Some(load_settings()))
}

#[specta::specta]
#[tauri::command]
pub async fn settings_open_config_directory() -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    open::that_detached(&dir).map_err(|e| format!("open dir: {e}"))?;
    Ok(())
}

#[specta::specta]
#[tauri::command]
pub async fn settings_update_settings(
    app: tauri::AppHandle,
    settings: Option<Settings>,
) -> Result<(), String> {
    let s = settings.unwrap_or_else(default_settings);
    update_settings(
        &mcp_bouncer::config::OsConfigProvider,
        &TauriEventEmitter(app),
        s,
    )
}

async fn fetch_and_cache_tools(
    app: &tauri::AppHandle,
    client_name: &str,
) -> Result<Vec<ToolInfo>, String> {
    let Some(cfg) = get_server_by_name(client_name) else {
        return Err("server not found".into());
    };
    let start = std::time::Instant::now();
    let logger = SqlitePublisher;
    let emitter = TauriEventEmitter(app.clone());
    let raw = fetch_tools_for_cfg(&cfg, &emitter, &logger)
        .await
        .map_err(|e| e.to_string())?;
    let mut out: Vec<ToolInfo> = Vec::new();
    for v in raw.iter() {
        let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let description = v
            .get("description")
            .and_then(|d| d.as_str())
            .map(|s| s.to_string());
        let input_schema = v
            .get("input_schema")
            .cloned()
            .or_else(|| v.get("inputSchema").cloned());
        out.push(ToolInfo {
            name: name.to_string(),
            description,
            input_schema,
        });
    }
    mcp_bouncer::tools_cache::set(client_name, out.clone()).await;
    mcp_bouncer::overlay::set_tools(client_name, out.len() as u32).await;
    let mut evt = Event::new("tools/list", format!("internal::{client_name}"));
    evt.server_name = Some(client_name.to_string());
    evt.origin = Some("internal".into());
    evt.request_json = Some(serde_json::json!({
        "method": "tools/list",
        "params": {}
    }));
    evt.response_json = Some(serde_json::json!({
        "result": {
            "tools": raw,
            "nextCursor": null
        }
    }));
    evt.duration_ms = Some(start.elapsed().as_millis() as i64);
    logger.log_and_emit(&emitter, evt);
    Ok(mcp_bouncer::tools_cache::filter_enabled_with(
        &mcp_bouncer::config::OsConfigProvider,
        client_name,
        out,
    ))
}

pub async fn connect_and_initialize<E>(emitter: &E, name: &str, cfg: &MCPServerConfig)
where
    E: mcp_bouncer::events::EventEmitter + Clone + Send + Sync + 'static,
{
    use mcp_bouncer::overlay as ov;
    tracing::info!(target = "lifecycle", server=%name, state=?ClientConnectionState::Connecting, "connect_start");
    ov::set_state(name, ClientConnectionState::Connecting).await;
    ov::set_error(name, None).await;
    client_status_changed(emitter, name, "connecting");
    let logger = SqlitePublisher;
    match ensure_rmcp_client(name, cfg, emitter, &logger).await {
        Ok(client) => match client.list_all_tools().await {
            Ok(tools) => {
                let mapped: Vec<ToolInfo> = tools
                    .iter()
                    .map(|t| ToolInfo {
                        name: t.name.to_string(),
                        description: t.description.clone().map(|s| s.to_string()),
                        input_schema: None,
                    })
                    .collect();
                mcp_bouncer::tools_cache::set(name, mapped.clone()).await;
                ov::set_tools(name, mapped.len() as u32).await;
                ov::set_state(name, ClientConnectionState::Connected).await;
                if matches!(
                    cfg.transport,
                    mcp_bouncer::config::TransportType::StreamableHttp
                ) && mcp_bouncer::oauth::load_credentials_for(
                    &mcp_bouncer::config::OsConfigProvider,
                    name,
                )
                .is_some()
                {
                    ov::set_oauth_authenticated(name, true).await;
                    ov::set_auth_required(name, false).await;
                }
                tracing::info!(target = "lifecycle", server=%name, state=?ClientConnectionState::Connected, tools=tools.len(), "connected");
                client_status_changed(emitter, name, "connected");
            }
            Err(e) => {
                if matches!(
                    cfg.transport,
                    mcp_bouncer::config::TransportType::StreamableHttp
                ) {
                    oauth::on_possible_unauthorized(name, Some(&cfg.endpoint)).await;
                }
                let snap = mcp_bouncer::overlay::snapshot().await;
                if let Some(ent) = snap.get(name)
                    && (ent.authorization_required
                        || ent.state == ClientConnectionState::RequiresAuthorization)
                {
                    client_status_changed(emitter, name, "requires_authorization");
                    return;
                }
                ov::set_error(name, Some(e.to_string())).await;
                ov::set_state(name, ClientConnectionState::Errored).await;
                tracing::warn!(target = "lifecycle", server=%name, state=?ClientConnectionState::Errored, "initialize_error");
                client_status_changed(emitter, name, "error");
            }
        },
        Err(e) => {
            let snap = mcp_bouncer::overlay::snapshot().await;
            if let Some(ent) = snap.get(name)
                && (ent.authorization_required
                    || ent.state == ClientConnectionState::RequiresAuthorization)
            {
                client_status_changed(emitter, name, "requires_authorization");
                return;
            }
            ov::set_error(name, Some(e.to_string())).await;
            ov::set_state(name, ClientConnectionState::Errored).await;
            client_error(emitter, name, "enable", &e.to_string());
            tracing::error!(target = "lifecycle", server=%name, state=?ClientConnectionState::Errored, error=%e, "start_failed");
            client_status_changed(emitter, name, "error");
        }
    }
}

fn get_server_by_name(name: &str) -> Option<MCPServerConfig> {
    load_settings()
        .mcp_servers
        .into_iter()
        .find(|c| c.name == name)
}

fn update_settings<E: EventEmitter>(
    cp: &dyn ConfigProvider,
    emitter: &E,
    settings: Settings,
) -> Result<(), String> {
    save_settings_with(cp, &settings)?;
    settings_updated(emitter);
    Ok(())
}

fn notify_servers_changed<E: EventEmitter>(emitter: &E, reason: &str) {
    servers_updated(emitter, reason);
}

fn dev_socket_proxy_path() -> Option<std::path::PathBuf> {
    let mut base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    base.pop();
    base.push("target");

    for profile in ["debug", "release"] {
        let mut candidate = base.join(profile).join(BIN_NAME_SOCKET_PROXY);
        if cfg!(target_os = "windows") && !candidate.as_os_str().to_string_lossy().ends_with(".exe")
        {
            candidate.set_extension("exe");
        }
        return Some(candidate);
    }
    None
}

fn build_debug_call_error_payload(error: &mcp::ErrorData) -> JsonValue {
    let error_value = serde_json::to_value(error).unwrap_or_else(|_| {
        json!({
            "message": error.to_string(),
        })
    });
    let message = error.message.clone().into_owned();
    json!({
        "type": "rpc_error",
        "message": message,
        "error": error_value,
    })
}

fn build_debug_call_service_error_payload(error: &ServiceError) -> JsonValue {
    json!({
        "type": "service_error",
        "message": error.to_string(),
        "kind": format!("{error:?}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use mcp_bouncer::config::{default_settings, settings_path};
    use mcp_bouncer::events::EVENT_SERVERS_UPDATED;
    use serde_json::Value;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone, Default)]
    struct MockEmitter(pub Arc<Mutex<Vec<(String, Value)>>>);

    impl EventEmitter for MockEmitter {
        fn emit(&self, name: &str, payload: &Value) {
            self.0
                .lock()
                .expect("mock emitter poisoned")
                .push((name.to_string(), payload.clone()));
        }
    }

    #[derive(Clone)]
    struct TestProvider {
        base: PathBuf,
    }

    impl ConfigProvider for TestProvider {
        fn base_dir(&self) -> PathBuf {
            self.base.clone()
        }
    }

    impl TestProvider {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis();
            let dir = std::env::temp_dir().join(format!(
                "mcp-bouncer-logic-{}-{}",
                std::process::id(),
                stamp
            ));
            fs::create_dir_all(&dir).unwrap();
            Self { base: dir }
        }
    }

    #[test]
    fn build_debug_call_error_payload_preserves_code_and_message() {
        let detail = json!({ "expected": "object", "received": "undefined" });
        let error = mcp::ErrorData::invalid_params("Required", Some(detail.clone()));
        let payload = build_debug_call_error_payload(&error);
        assert_eq!(payload["type"], json!("rpc_error"));
        assert_eq!(payload["message"], json!("Required"));
        assert_eq!(payload["error"]["message"], json!("Required"));
        assert_eq!(
            payload["error"]["code"],
            json!(mcp::ErrorCode::INVALID_PARAMS.0)
        );
        assert_eq!(payload["error"]["data"], detail);
    }

    #[test]
    fn build_debug_call_service_error_payload_includes_message_and_kind() {
        let payload = build_debug_call_service_error_payload(&ServiceError::TransportClosed);
        assert_eq!(payload["type"], json!("service_error"));
        assert!(
            payload["message"]
                .as_str()
                .unwrap()
                .contains("Transport closed")
        );
        assert!(
            payload["kind"]
                .as_str()
                .unwrap()
                .contains("TransportClosed")
        );
    }

    #[test]
    fn update_settings_saves_and_emits() {
        let cp = TestProvider::new();
        let mock = MockEmitter::default();
        let s = default_settings();
        super::update_settings(&cp, &mock, s).unwrap();
        let p = settings_path(&cp);
        assert!(p.exists());
        let events = mock.0.lock().unwrap();
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn notify_servers_changed_emits_once() {
        let mock = MockEmitter::default();
        super::notify_servers_changed(&mock, "add");
        let events = mock.0.lock().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, EVENT_SERVERS_UPDATED);
    }
}
