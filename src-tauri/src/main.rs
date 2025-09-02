#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release
use std::{collections::HashMap, fs, sync::OnceLock};
use tauri::Manager;

use mcp_bouncer::app_logic;
use mcp_bouncer::client::{ ensure_rmcp_client, remove_rmcp_client, fetch_tools_for_cfg };
use mcp_bouncer::config::{
    ClientStatus, ClientConnectionState, IncomingClient, MCPServerConfig, Settings, config_dir, default_settings,
    load_settings, save_settings,
};
use mcp_bouncer::events::{
    TauriEventEmitter, client_error, client_status_changed, incoming_clients_updated,
    servers_updated,
};
use mcp_bouncer::incoming::list_incoming;
use mcp_bouncer::oauth::start_oauth_for_server;
use mcp_bouncer::server::start_http_server;

// ---------- Streamable HTTP MCP proxy (basic) ----------

static PROXY_STARTED: OnceLock<()> = OnceLock::new();

fn spawn_mcp_proxy(app: &tauri::AppHandle) {
    if PROXY_STARTED.set(()).is_err() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
        let _ = start_http_server(
            mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
            mcp_bouncer::config::OsConfigProvider,
            addr,
        )
        .await;
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
            let oauth_ok = mcp_bouncer::overlay::snapshot().await
                .get(&name)
                .map(|e| e.oauth_authenticated)
                .unwrap_or(false);
            if !oauth_ok {
                let err = "Authorization required".to_string();
                // emit client error
                client_error(&TauriEventEmitter(app.clone()), &name, "enable", &err);
                // update client state with last_error and auth_required
                mcp_bouncer::overlay::set_error(&name, Some("Authorization required".into())).await;
                mcp_bouncer::overlay::set_auth_required(&name, true).await;
                mcp_bouncer::overlay::set_oauth_authenticated(&name, false).await;
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
                connect_and_initialize(&TauriEventEmitter(app.clone()), &server_name, &cfg).await;
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
                connect_and_initialize(&TauriEventEmitter(app.clone()), &server_name, &cfg).await;
            }
        } else {
            let _ = remove_rmcp_client(&server_name).await;
            mcp_bouncer::overlay::set_state(&server_name, ClientConnectionState::Disconnected).await;
            mcp_bouncer::overlay::set_error(&server_name, None).await;
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

    // Ensure client exists; mark connected
    if let Some(cfg) = get_server_by_name(&name) {
        connect_and_initialize(&TauriEventEmitter(app.clone()), &name, &cfg).await;
    }
    client_status_changed(&TauriEventEmitter(app.clone()), &name, "restart");
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
    // Kick off OAuth flow (opens browser, waits for callback)
    start_oauth_for_server(&TauriEventEmitter(app.clone()), &name, &endpoint).await
}

#[tauri::command]
async fn mcp_get_client_tools(client_name: String) -> Result<Vec<serde_json::Value>, String> {
    if let Some(cfg) = get_server_by_name(&client_name) {
        return fetch_tools_for_cfg(&cfg).await;
    }
    Ok(Vec::new())
}

async fn connect_and_initialize<E: mcp_bouncer::events::EventEmitter>(
    emitter: &E,
    name: &str,
    cfg: &MCPServerConfig,
) {
    use mcp_bouncer::overlay as ov;
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
                    client_status_changed(emitter, name, "connected");
                }
                Err(e) => {
                    let msg = e.to_string();
                    let lower = msg.to_ascii_lowercase();
                    if lower.contains("401") || lower.contains("unauthorized") {
                        ov::set_auth_required(name, true).await;
                        ov::set_oauth_authenticated(name, false).await;
                    }
                    ov::set_error(name, Some(msg)).await;
                    ov::set_state(name, ClientConnectionState::Errored).await;
                    client_status_changed(emitter, name, "error");
                }
            }
        }
        Err(e) => {
            ov::set_error(name, Some(e.clone())).await;
            ov::set_state(name, ClientConnectionState::Errored).await;
            client_error(emitter, name, "enable", &e);
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
    tauri::Builder::default()
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
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
