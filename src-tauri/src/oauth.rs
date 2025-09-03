use std::collections::HashMap;
use std::path::PathBuf;

use axum::{Router, extract::Query, http::StatusCode, routing::get};
use rmcp::transport::auth::{OAuthState, OAuthTokenResponse};

use crate::client::ensure_rmcp_client;
use crate::config::{ClientConnectionState, ConfigProvider, OsConfigProvider, load_settings_with};
use crate::events::{EventEmitter, client_error, client_status_changed};
use crate::overlay;
use anyhow::{Context, Result};

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
struct OAuthFile(HashMap<String, OAuthTokenResponse>);

fn oauth_path(cp: &dyn ConfigProvider) -> PathBuf {
    cp.base_dir().join("oauth.json")
}

pub fn load_credentials_for(cp: &dyn ConfigProvider, name: &str) -> Option<OAuthTokenResponse> {
    let p = oauth_path(cp);
    if !p.exists() {
        return None;
    }
    let bytes = std::fs::read(&p).ok()?;
    let map: OAuthFile = serde_json::from_slice(&bytes).ok()?;
    map.0.get(name).cloned()
}

pub fn save_credentials_for(
    cp: &dyn ConfigProvider,
    name: &str,
    creds: OAuthTokenResponse,
) -> Result<(), String> {
    let p = oauth_path(cp);
    let mut map = if p.exists() {
        let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
        serde_json::from_slice::<OAuthFile>(&bytes).unwrap_or_default()
    } else {
        OAuthFile::default()
    };
    map.0.insert(name.to_string(), creds);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        &p,
        serde_json::to_vec_pretty(&map).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, serde::Deserialize)]
struct CallbackQuery {
    code: String,
    #[serde(rename = "state")]
    _state: Option<String>,
}

/// Start an OAuth flow for a server. Spawns a temporary callback server on localhost, opens the browser,
/// handles the code exchange, persists credentials to XDG config, and updates overlay status.
pub async fn start_oauth_for_server<E: EventEmitter>(
    emitter: &E,
    name: &str,
    endpoint: &str,
) -> Result<()> {
    // derive base URL from endpoint
    let url = reqwest::Url::parse(endpoint).context("url parse")?;
    let mut base = url.clone();
    base.set_path("");

    // local callback server at random port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .context("bind oauth callback")?;
    let addr = listener.local_addr().context("callback addr")?;
    let redirect_uri = format!("http://{addr}/callback");

    // Initialize OAuth state machine
    let mut state = OAuthState::new(base.as_str(), None)
        .await
        .context("oauth init")?;
    // Scope set kept minimal; servers can ignore/accept
    state
        .start_authorization(&["mcp"], &redirect_uri)
        .await
        .context("oauth start")?;
    let auth_url = state.get_authorization_url().await.context("oauth url")?;

    // Spawn callback server to capture auth code
    let (tx, rx) = tokio::sync::oneshot::channel::<CallbackQuery>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let app = Router::new().route(
        "/callback",
        get({
            let tx_shared = tx_shared.clone();
            move |Query(q): Query<CallbackQuery>| {
                let tx_shared = tx_shared.clone();
                async move {
                    if let Some(sender) = tx_shared.lock().unwrap().take() {
                        let _ = sender.send(q);
                    }
                    (
                        StatusCode::OK,
                        "Authorization complete. You can close this window.",
                    )
                }
            }
        }),
    );
    let server = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!(target = "oauth", "callback server error: {}", e);
        }
    });
    drop(server); // detach task

    // Open system browser to authorization URL
    let _ = open::that_detached(auth_url.clone());

    // Wait for callback
    let q = rx.await.context("callback wait")?;

    // Complete the code exchange
    state
        .handle_callback(&q.code)
        .await
        .context("oauth exchange")?;

    // Try to export credentials for persistence if supported
    if let Ok((_, Some(creds))) = state.get_credentials().await {
        let _ = save_credentials_for(&OsConfigProvider, name, creds);
    }

    // Update overlay state: authorized, no auth required, clear error (in-memory only)
    overlay::set_oauth_authenticated(name, true).await;
    overlay::set_auth_required(name, false).await;
    overlay::set_error(name, None).await;

    // Attempt to (re)start the client automatically if the server is enabled
    let settings = load_settings_with(&OsConfigProvider);
    if let Some(cfg) = settings
        .mcp_servers
        .into_iter()
        .find(|c| c.name == name && c.enabled)
    {
        overlay::set_error(name, None).await;
        overlay::set_oauth_authenticated(name, true).await;
        overlay::set_auth_required(name, false).await;
        overlay::set_state(name, ClientConnectionState::Connecting).await;
        client_status_changed(emitter, name, "connecting");
        match ensure_rmcp_client(name, &cfg).await {
            Ok(client) => match client.list_all_tools().await {
                Ok(tools) => {
                    overlay::set_error(name, None).await;
                    overlay::set_state(name, ClientConnectionState::Connected).await;
                    overlay::set_oauth_authenticated(name, true).await;
                    overlay::set_auth_required(name, false).await;
                    crate::overlay::set_tools(name, tools.len() as u32).await;
                    client_status_changed(emitter, name, "connected");
                }
                Err(e) => {
                    overlay::set_error(name, Some(e.to_string())).await;
                    overlay::set_state(name, ClientConnectionState::Errored).await;
                    client_error(emitter, name, "oauth_connect", &e.to_string());
                    client_status_changed(emitter, name, "error");
                }
            },
            Err(e) => {
                overlay::set_error(name, Some(e.to_string())).await;
                overlay::set_state(name, ClientConnectionState::Errored).await;
                client_error(emitter, name, "oauth_connect", &e.to_string());
                client_status_changed(emitter, name, "error");
            }
        }
    } else {
        // Still emit an update so UI can refresh
        client_status_changed(emitter, name, "oauth");
    }
    Ok(())
}
