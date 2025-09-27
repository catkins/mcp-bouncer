#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release
use std::{collections::HashMap, fs, sync::OnceLock};
use tauri::Manager;

use mcp_bouncer::app_logic;
use mcp_bouncer::client::{ensure_rmcp_client, fetch_tools_for_cfg, remove_rmcp_client};
use mcp_bouncer::config::{
    ClientConnectionState, ClientStatus, IncomingClient, MCPServerConfig, Settings, config_dir,
    default_settings, load_settings, save_settings,
};
use mcp_bouncer::events::{TauriEventEmitter, client_error, client_status_changed};
use mcp_bouncer::incoming::list_incoming;
use mcp_bouncer::logging::{RpcEventPublisher, SqlitePublisher};
use mcp_bouncer::oauth::start_oauth_for_server;
use mcp_bouncer::server::{get_runtime_listen_addr, start_http_server};
use mcp_bouncer::unauthorized;
#[cfg(debug_assertions)]
use specta_typescript::Typescript;
#[cfg(debug_assertions)]
use tauri_specta::{Builder as SpectaBuilder, collect_commands};

// ---------- Streamable HTTP MCP proxy (basic) ----------

static PROXY_STARTED: OnceLock<()> = OnceLock::new();

fn spawn_mcp_proxy(app: &tauri::AppHandle) {
    if PROXY_STARTED.set(()).is_err() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let logger = SqlitePublisher;
        let primary = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
        if let Err(e) = start_http_server(
            mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
            mcp_bouncer::config::OsConfigProvider,
            logger.clone(),
            primary,
        )
        .await
        {
            tracing::warn!(
                "[server] bind {} failed: {}; falling back to ephemeral port",
                primary,
                e
            );
            let _ = start_http_server(
                mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
                mcp_bouncer::config::OsConfigProvider,
                logger,
                std::net::SocketAddr::from(([127, 0, 0, 1], 0)),
            )
            .await;
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

#[specta::specta]
#[tauri::command]
async fn mcp_list() -> Result<Vec<MCPServerConfig>, String> {
    Ok(load_settings().mcp_servers)
}

#[specta::specta]
#[tauri::command]
async fn mcp_listen_addr() -> Result<String, String> {
    if let Some(addr) = get_runtime_listen_addr() {
        return Ok(format!("http://{}:{}/mcp", addr.ip(), addr.port()));
    }
    Ok(load_settings().listen_addr)
}

#[specta::specta]
#[tauri::command]
async fn mcp_is_active() -> Result<bool, String> {
    let s = load_settings();
    Ok(!s.mcp_servers.is_empty())
}

#[specta::specta]
#[tauri::command]
async fn mcp_get_client_status() -> Result<HashMap<String, ClientStatus>, String> {
    let map = mcp_bouncer::status::compute_client_status_map().await;
    Ok(map)
}

#[specta::specta]
#[tauri::command]
async fn mcp_get_incoming_clients() -> Result<Vec<IncomingClient>, String> {
    Ok(list_incoming().await)
}

#[specta::specta]
#[tauri::command]
async fn mcp_add_server(app: tauri::AppHandle, config: MCPServerConfig) -> Result<(), String> {
    let mut s = load_settings();
    if s.mcp_servers.iter().any(|c| c.name == config.name) {
        return Err("server with that name already exists".into());
    }
    s.mcp_servers.push(config);
    save_settings(&s)?;
    app_logic::notify_servers_changed(&TauriEventEmitter(app.clone()), "add");
    Ok(())
}

#[specta::specta]
#[tauri::command]
async fn mcp_update_server(
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
        // notify UI that servers changed
        app_logic::notify_servers_changed(&TauriEventEmitter(app.clone()), "update");
        // try to connect if enabling
        if let Some(cfg) = get_server_by_name(&server_name)
            && enabling
        {
            // If HTTP transport requires auth and no credentials, gate and mark unauthorized
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
    } else {
        Err("server not found".into())
    }
}

#[specta::specta]
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
    mcp_bouncer::overlay::remove(&name).await;
    app_logic::notify_servers_changed(&TauriEventEmitter(app.clone()), "remove");
    Ok(())
}

#[specta::specta]
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
        app_logic::notify_servers_changed(&TauriEventEmitter(app.clone()), "toggle");
        Ok(())
    } else {
        Err("server not found".into())
    }
}

#[specta::specta]
#[tauri::command]
async fn mcp_restart_client(app: tauri::AppHandle, name: String) -> Result<(), String> {
    // If server doesn't exist or is disabled, emit client_error
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

    // Ensure client exists; connect_and_initialize will emit appropriate status events
    if let Some(cfg) = get_server_by_name(&name) {
        connect_and_initialize(&TauriEventEmitter(app.clone()), &name, &cfg).await;
    }
    Ok(())
}

#[specta::specta]
#[tauri::command]
async fn mcp_start_oauth(app: tauri::AppHandle, name: String) -> Result<(), String> {
    // Find server and ensure endpoint available
    let cfg = get_server_by_name(&name).ok_or_else(|| "server not found".to_string())?;
    let endpoint = cfg.endpoint.clone();
    if endpoint.is_empty() {
        return Err("missing endpoint".to_string());
    }
    // Mark as authorizing for UI feedback
    mcp_bouncer::overlay::set_state(&name, ClientConnectionState::Authorizing).await;
    let emitter = TauriEventEmitter(app.clone());
    client_status_changed(&emitter, &name, "authorizing");
    let logger = logging::SqlitePublisher;
    // Kick off OAuth flow (opens browser, waits for callback)
    start_oauth_for_server(&emitter, &logger, &name, &endpoint)
        .await
        .map_err(|e| e.to_string())
}

use mcp_bouncer::logging;
use mcp_bouncer::types::ToolInfo;

#[tauri::command]
#[specta::specta]
async fn mcp_get_client_tools(client_name: String) -> Result<Vec<ToolInfo>, String> {
    // Use cached tools to avoid re-fetching every modal open
    let list = mcp_bouncer::tools_cache::get(&client_name)
        .await
        .unwrap_or_default();
    // Filter based on persisted toggles
    Ok(mcp_bouncer::tools_cache::filter_enabled_with(
        &mcp_bouncer::config::OsConfigProvider,
        &client_name,
        list,
    ))
}

// ---------------- Logs (SQLite) UI commands ----------------
// Note: With Tauri SQL Plugin, these commands are being migrated to frontend SQL operations
// The frontend can now access the database directly via @tauri-apps/plugin-sql

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
struct LogsCursor {
    ts_ms: f64,
    id: String,
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
struct LogsListParams {
    server: Option<String>,
    method: Option<String>,
    ok: Option<bool>,
    limit: Option<u32>,
    after: Option<LogsCursor>,
    start_ts_ms: Option<f64>,
    end_ts_ms: Option<f64>,
}

#[tauri::command]
#[specta::specta]
async fn mcp_logs_list(params: LogsListParams) -> Result<Vec<logging::EventRow>, String> {
    let limit = params.limit.unwrap_or(50) as usize;
    let after = params
        .after
        .as_ref()
        .map(|c| (c.ts_ms as i64, c.id.as_str()));
    logging::query_events(logging::QueryParams {
        server: params.server.as_deref(),
        method: params.method.as_deref(),
        ok: params.ok,
        limit,
        after,
        start_ts_ms: params.start_ts_ms.map(|v| v as i64),
        end_ts_ms: params.end_ts_ms.map(|v| v as i64),
    })
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
struct LogsSinceParams {
    since_ts_ms: f64,
    server: Option<String>,
    method: Option<String>,
    ok: Option<bool>,
    limit: Option<u32>,
}

#[tauri::command]
#[specta::specta]
async fn mcp_logs_list_since(params: LogsSinceParams) -> Result<Vec<logging::EventRow>, String> {
    let limit = params.limit.unwrap_or(50) as usize;
    logging::query_events_since(
        params.since_ts_ms as i64,
        params.server.as_deref(),
        params.method.as_deref(),
        params.ok,
        limit,
    )
}

#[tauri::command]
#[specta::specta]
async fn mcp_logs_count(server: Option<String>) -> Result<f64, String> {
    logging::count_events(server.as_deref())
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
struct LogsHistogramParams {
    server: Option<String>,
    method: Option<String>,
    ok: Option<bool>,
    max_buckets: Option<u32>,
}

#[tauri::command]
#[specta::specta]
async fn mcp_logs_histogram(
    params: LogsHistogramParams,
) -> Result<logging::EventHistogram, String> {
    logging::query_event_histogram(logging::HistogramParams {
        server: params.server.as_deref(),
        method: params.method.as_deref(),
        ok: params.ok,
        max_buckets: params.max_buckets.map(|v| v as usize),
    })
}

#[specta::specta]
#[tauri::command]
async fn mcp_refresh_client_tools(
    app: tauri::AppHandle,
    client_name: String,
) -> Result<(), String> {
    let Some(cfg) = get_server_by_name(&client_name) else {
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
    mcp_bouncer::tools_cache::set(&client_name, out.clone()).await;
    mcp_bouncer::overlay::set_tools(&client_name, out.len() as u32).await;
    // Log listTools event for internal refresh + emit live update
    let mut evt = logging::Event::new("listTools", format!("internal::{client_name}"));
    evt.server_name = Some(client_name.clone());
    // Mirror the external JSON-RPC-ish shape used elsewhere
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
    Ok(())
}

async fn connect_and_initialize<E>(emitter: &E, name: &str, cfg: &MCPServerConfig)
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
        Ok(client) => {
            // list tools (forces initialize + verifies connection)
            match client.list_all_tools().await {
                Ok(tools) => {
                    // Populate cache and tools count
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
                    // If HTTP and we have stored OAuth credentials, reflect authenticated badge
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
                        unauthorized::on_possible_unauthorized(name, Some(&cfg.endpoint)).await;
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
            }
        }
        Err(e) => {
            // If an unauthorized state was inferred (e.g., via HTTP probe), don't surface a noisy error.
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

#[specta::specta]
#[tauri::command]
async fn mcp_toggle_tool(
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
async fn settings_get_settings() -> Result<Option<Settings>, String> {
    Ok(Some(load_settings()))
}

#[specta::specta]
#[tauri::command]
async fn settings_open_config_directory() -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    open::that_detached(&dir).map_err(|e| format!("open dir: {e}"))?;
    Ok(())
}

#[specta::specta]
#[tauri::command]
async fn settings_update_settings(
    app: tauri::AppHandle,
    settings: Option<Settings>,
) -> Result<(), String> {
    let s = settings.unwrap_or_else(default_settings);
    app_logic::update_settings(
        &mcp_bouncer::config::OsConfigProvider,
        &TauriEventEmitter(app),
        s,
    )
}

fn main() {
    // Initialize structured logging via tracing with env filter.
    // Configure via RUST_LOG, e.g., RUST_LOG=info,mcp_bouncer=debug
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .or_else(|_| tracing_subscriber::EnvFilter::try_new("info,mcp_bouncer=debug"))
        .unwrap();
    let _ = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(true)
        .pretty()
        .try_init();
    #[cfg(debug_assertions)]
    {
        // Export Typescript bindings for commands during dev builds.
        let start = std::time::Instant::now();
        tracing::info!(target = "specta", "binding_generation_start");

        let builder = SpectaBuilder::<tauri::Wry>::new().commands(collect_commands![
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
            mcp_start_oauth,
            mcp_get_client_tools,
            mcp_refresh_client_tools,
            mcp_toggle_tool,
            mcp_logs_list,
            mcp_logs_list_since,
            mcp_logs_histogram,
            mcp_logs_count,
            settings_get_settings,
            settings_open_config_directory,
            settings_update_settings
        ]);

        let export_result = builder.export(Typescript::default(), "../src/tauri/bindings.ts");

        let elapsed = start.elapsed();
        match export_result {
            Ok(_) => {
                tracing::info!(
                    target = "specta",
                    duration_ms = elapsed.as_millis(),
                    "binding_generation_success"
                );
            }
            Err(e) => {
                tracing::error!(target = "specta", duration_ms = elapsed.as_millis(), error = %e, "binding_generation_failed");
            }
        }
    }

    let res = tauri::Builder::default()
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
        // SQL plugin for database operations
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Ensure logs are flushed on window close / app shutdown
        .on_window_event(|_win, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Best-effort synchronous flush+checkpoint
                tauri::async_runtime::block_on(mcp_bouncer::logging::force_flush_and_checkpoint());
            }
        })
        .setup(|app| {
            // start the proxy server (idempotent)
            spawn_mcp_proxy(app.app_handle());
            // Auto-connect all enabled servers on startup
            let app_handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let settings = mcp_bouncer::config::load_settings();
                for cfg in settings.mcp_servers.into_iter().filter(|c| c.enabled) {
                    let emitter = TauriEventEmitter(app_handle.clone());
                    tauri::async_runtime::spawn(async move {
                        connect_and_initialize(&emitter, &cfg.name, &cfg).await;
                    });
                }
            });
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
            mcp_start_oauth,
            mcp_get_client_tools,
            mcp_refresh_client_tools,
            mcp_toggle_tool,
            mcp_logs_list,
            mcp_logs_list_since,
            mcp_logs_histogram,
            mcp_logs_count,
            settings_get_settings,
            settings_open_config_directory,
            settings_update_settings
        ])
        .run(tauri::generate_context!());
    // Final best-effort flush after event loop exits
    tauri::async_runtime::block_on(mcp_bouncer::logging::force_flush_and_checkpoint());
    res.expect("error while running tauri application");
}
