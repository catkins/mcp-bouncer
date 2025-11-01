#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release
mod commands;

use std::{fs, sync::Arc, sync::OnceLock};
use tauri::Manager;

use mcp_bouncer::events::TauriEventEmitter;
use mcp_bouncer::logging::SqlitePublisher;
use mcp_bouncer::runtime::RuntimeState;
use mcp_bouncer::server::start_server;
use mcp_bouncer::{
    config::{ConfigProvider, ServerTransport},
    runtime,
};
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
        let settings = mcp_bouncer::config::load_settings();
        let addr_or_path = match settings.transport {
            ServerTransport::Tcp => {
                // Try primary port, fallback to ephemeral
                let primary = std::net::SocketAddr::from(([127, 0, 0, 1], 8091));
                match start_server(
                    mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
                    mcp_bouncer::config::OsConfigProvider,
                    logger.clone(),
                    ServerTransport::Tcp,
                    primary.to_string(),
                )
                .await
                {
                    Ok((_handle, _bound)) => {
                        tracing::info!("[server] started on TCP {}", primary);
                        return;
                    }
                    Err(e) => {
                        tracing::warn!(
                            "[server] bind {} failed: {}; falling back to ephemeral port",
                            primary,
                            e
                        );
                        std::net::SocketAddr::from(([127, 0, 0, 1], 0)).to_string()
                    }
                }
            }
            ServerTransport::Unix => "/tmp/mcp-bouncer.sock".to_string(),
            ServerTransport::Stdio => {
                "".to_string() // No address needed for stdio
            }
        };

        if let Err(e) = start_server(
            mcp_bouncer::events::TauriEventEmitter(app_handle.clone()),
            mcp_bouncer::config::OsConfigProvider,
            logger,
            settings.transport.clone(),
            addr_or_path,
        )
        .await
        {
            tracing::error!("[server] failed to start: {}", e);
        }
    });
}

fn main() {
    // Ensure PATH matches interactive shell when launched outside the terminal (macOS/Linux).
    let _ = fix_path_env::fix();
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
            commands::mcp_list,
            commands::mcp_listen_addr,
            commands::mcp_is_active,
            commands::mcp_get_client_status,
            commands::mcp_get_incoming_clients,
            commands::mcp_add_server,
            commands::mcp_update_server,
            commands::mcp_remove_server,
            commands::mcp_toggle_server_enabled,
            commands::mcp_restart_client,
            commands::mcp_start_oauth,
            commands::mcp_get_client_tools,
            commands::mcp_refresh_client_tools,
            commands::mcp_debug_call_tool,
            commands::mcp_toggle_tool,
            commands::settings_get_settings,
            commands::settings_open_config_directory,
            commands::settings_update_settings
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

    let log_dir = mcp_bouncer::config::config_dir();
    if let Err(e) = fs::create_dir_all(&log_dir) {
        tracing::warn!(error = %e, "failed to create log directory");
    }
    let sql_plugin = tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:logs.sqlite", mcp_bouncer::logging::migrations())
        .build();

    let provider: Arc<dyn ConfigProvider> = Arc::new(mcp_bouncer::config::OsConfigProvider);
    let runtime_state = Arc::new(RuntimeState::new(provider.clone()));
    runtime::set_global(runtime_state.clone());

    let res = tauri::Builder::default()
        // Shell plugin is commonly needed to open links, etc.
        .plugin(tauri_plugin_shell::init())
        // SQL plugin for database operations
        .plugin(sql_plugin)
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
                        commands::connect_and_initialize(&emitter, &cfg.name, &cfg).await;
                    });
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::mcp_list,
            commands::mcp_listen_addr,
            commands::mcp_is_active,
            commands::mcp_get_client_status,
            commands::mcp_get_incoming_clients,
            commands::mcp_add_server,
            commands::mcp_update_server,
            commands::mcp_remove_server,
            commands::mcp_toggle_server_enabled,
            commands::mcp_restart_client,
            commands::mcp_start_oauth,
            commands::mcp_get_client_tools,
            commands::mcp_refresh_client_tools,
            commands::mcp_debug_call_tool,
            commands::mcp_toggle_tool,
            commands::settings_get_settings,
            commands::settings_open_config_directory,
            commands::settings_update_settings
        ])
        .manage(runtime_state)
        .run(tauri::generate_context!());
    // Final best-effort flush after event loop exits
    tauri::async_runtime::block_on(mcp_bouncer::logging::force_flush_and_checkpoint());
    res.expect("error while running tauri application");
}
