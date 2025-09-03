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
use mcp_bouncer::oauth::start_oauth_for_server;
use mcp_bouncer::server::{get_runtime_listen_addr, start_http_server};
use mcp_bouncer::unauthorized;

// ---------- Streamable HTTP MCP proxy (basic) ----------

static PROXY_STARTED: OnceLock<()> = OnceLock::new();

fn spawn_mcp_proxy(app: &tauri::AppHandle) {
    if PROXY_STARTED.set(()).is_err() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let primary = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
        if let Err(e) = start_http_server(
            mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
            mcp_bouncer::config::OsConfigProvider,
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

#[tauri::command]
async fn mcp_list() -> Result<Vec<MCPServerConfig>, String> {
    Ok(load_settings().mcp_servers)
}

#[tauri::command]
async fn mcp_listen_addr() -> Result<String, String> {
    if let Some(addr) = get_runtime_listen_addr() {
        return Ok(format!("http://{}:{}/mcp", addr.ip(), addr.port()));
    }
    Ok(load_settings().listen_addr)
}

#[tauri::command]
async fn mcp_is_active() -> Result<bool, String> {
    let s = load_settings();
    Ok(!s.mcp_servers.is_empty())
}

#[tauri::command]
async fn mcp_get_client_status() -> Result<HashMap<String, ClientStatus>, String> {
    let map = mcp_bouncer::status::compute_client_status_map().await;
    Ok(map)
}

#[tauri::command]
async fn mcp_get_incoming_clients() -> Result<Vec<IncomingClient>, String> {
    Ok(list_incoming().await)
}

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
        if enabling {
            if let Some(cfg) = get_server_by_name(&server_name) {
                // If HTTP transport requires auth and no credentials, gate and mark unauthorized
                if matches!(
                    cfg.transport,
                    Some(mcp_bouncer::config::TransportType::StreamableHttp)
                ) && cfg.requires_auth.unwrap_or(false)
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
        }
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
    mcp_bouncer::overlay::remove(&name).await;
    app_logic::notify_servers_changed(&TauriEventEmitter(app.clone()), "remove");
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
        save_settings(&s)?;
        if enabled {
            if let Some(cfg) = get_server_by_name(&server_name) {
                if matches!(
                    cfg.transport,
                    Some(mcp_bouncer::config::TransportType::StreamableHttp)
                ) && cfg.requires_auth.unwrap_or(false)
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

#[tauri::command]
async fn mcp_start_oauth(app: tauri::AppHandle, name: String) -> Result<(), String> {
    // Find server and ensure endpoint available
    let cfg = get_server_by_name(&name).ok_or_else(|| "server not found".to_string())?;
    let endpoint = cfg
        .endpoint
        .clone()
        .ok_or_else(|| "missing endpoint".to_string())?;
    // Mark as authorizing for UI feedback
    mcp_bouncer::overlay::set_state(&name, ClientConnectionState::Authorizing).await;
    client_status_changed(&TauriEventEmitter(app.clone()), &name, "authorizing");
    // Kick off OAuth flow (opens browser, waits for callback)
    start_oauth_for_server(&TauriEventEmitter(app.clone()), &name, &endpoint)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mcp_get_client_tools(client_name: String) -> Result<Vec<serde_json::Value>, String> {
    if let Some(cfg) = get_server_by_name(&client_name) {
        let list = fetch_tools_for_cfg(&cfg).await.map_err(|e| e.to_string())?;
        // Filter based on toggles
        let state =
            mcp_bouncer::config::load_tools_state_with(&mcp_bouncer::config::OsConfigProvider);
        let filtered: Vec<_> = list
            .into_iter()
            .filter(|v| {
                let Some(tool_name) = v.get("name").and_then(|n| n.as_str()) else {
                    return true;
                };
                state
                    .0
                    .get(&client_name)
                    .and_then(|m| m.get(tool_name))
                    .copied()
                    .unwrap_or(true)
            })
            .collect();
        return Ok(filtered);
    }
    Ok(Vec::new())
}

async fn connect_and_initialize<E: mcp_bouncer::events::EventEmitter>(
    emitter: &E,
    name: &str,
    cfg: &MCPServerConfig,
) {
    use mcp_bouncer::overlay as ov;
    tracing::info!(target = "lifecycle", server=%name, state=?ClientConnectionState::Connecting, "connect_start");
    ov::set_state(name, ClientConnectionState::Connecting).await;
    ov::set_error(name, None).await;
    client_status_changed(emitter, name, "connecting");
    match ensure_rmcp_client(name, cfg).await {
        Ok(client) => {
            // list tools (forces initialize + verifies connection)
            match client.list_all_tools().await {
                Ok(tools) => {
                    ov::set_tools(name, tools.len() as u32).await;
                    ov::set_state(name, ClientConnectionState::Connected).await;
                    // If HTTP and we have stored OAuth credentials, reflect authenticated badge
                    if matches!(
                        cfg.transport,
                        Some(mcp_bouncer::config::TransportType::StreamableHttp)
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
                        Some(mcp_bouncer::config::TransportType::StreamableHttp)
                    ) {
                        unauthorized::on_possible_unauthorized(name, cfg.endpoint.as_deref()).await;
                    }
                    let snap = mcp_bouncer::overlay::snapshot().await;
                    if let Some(ent) = snap.get(name) {
                        if ent.authorization_required
                            || ent.state == ClientConnectionState::RequiresAuthorization
                        {
                            client_status_changed(emitter, name, "requires_authorization");
                            return;
                        }
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
            if let Some(ent) = snap.get(name) {
                if ent.authorization_required
                    || ent.state == ClientConnectionState::RequiresAuthorization
                {
                    client_status_changed(emitter, name, "requires_authorization");
                    return;
                }
            }
            ov::set_error(name, Some(e.to_string())).await;
            ov::set_state(name, ClientConnectionState::Errored).await;
            client_error(emitter, name, "enable", &e.to_string());
            tracing::error!(target = "lifecycle", server=%name, state=?ClientConnectionState::Errored, error=%e, "start_failed");
            client_status_changed(emitter, name, "error");
        }
    }
}

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
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .level_for("mcp_bouncer", log::LevelFilter::Debug)
                .targets([
                    tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir { file_name: Some("mcp-bouncer.log".into()) },
                    ),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
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
            mcp_toggle_tool,
            settings_get_settings,
            settings_open_config_directory,
            settings_update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
