use std::collections::HashMap;
use std::path::PathBuf;

use axum::{Router, extract::Query, http::StatusCode, routing::get};
use axum::response::Html;
use rmcp::transport::auth::{OAuthState, OAuthTokenResponse};

use crate::client::ensure_rmcp_client;
use crate::config::{ClientConnectionState, ConfigProvider, OsConfigProvider, load_settings_with};
use crate::events::{EventEmitter, client_error, client_status_changed};
use crate::overlay;
use anyhow::{Context, Result};

// Persist an absolute `expires_at` alongside the raw OAuth response JSON.

#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
struct OAuthFileV2(HashMap<String, PersistedCreds>);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct PersistedCreds {
    // Raw OAuth token response as JSON (keeps compatibility with upstream crate fields)
    data: serde_json::Value,
    // Absolute Unix timestamp (seconds) when access token expires
    expires_at: Option<i64>,
}

fn oauth_path(cp: &dyn ConfigProvider) -> PathBuf {
    cp.base_dir().join("oauth.json")
}

pub fn load_credentials_for(cp: &dyn ConfigProvider, name: &str) -> Option<OAuthTokenResponse> {
    let p = oauth_path(cp);
    if !p.exists() {
        return None;
    }
    let bytes = std::fs::read(&p).ok()?;

    // Parse new mandatory format
    if let Ok(map) = serde_json::from_slice::<OAuthFileV2>(&bytes) {
        if let Some(pc) = map.0.get(name) {
            let mut data = pc.data.clone();
            // Compute current relative expires_in from absolute expires_at
            if let Some(expires_at) = pc.expires_at {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let mut rel = expires_at - now;
                if rel < 0 { rel = 0; }
                if let Some(obj) = data.as_object_mut() {
                    obj.insert(
                        "expires_in".to_string(),
                        serde_json::Value::Number(serde_json::Number::from(rel as u64)),
                    );
                }
            }
            return serde_json::from_value::<OAuthTokenResponse>(data).ok();
        }
        None
    } else {
        None
    }
}

pub fn save_credentials_for(
    cp: &dyn ConfigProvider,
    name: &str,
    creds: OAuthTokenResponse,
) -> Result<(), String> {
    let p = oauth_path(cp);

    // Serialize creds to JSON to avoid relying on private struct fields
    let data = serde_json::to_value(&creds).map_err(|e| e.to_string())?;

    // Compute absolute expires_at from relative expires_in if present
    let expires_at: Option<i64> = match data.get("expires_in").and_then(|v| v.as_i64()) {
        Some(rel) if rel > 0 => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            Some(now + rel)
        }
        _ => None,
    };

    let mut map = if p.exists() {
        // Read existing file or start fresh
        let bytes = std::fs::read(&p).map_err(|e| e.to_string())?;
        serde_json::from_slice::<OAuthFileV2>(&bytes).unwrap_or_default()
    } else {
        OAuthFileV2::default()
    };

    map.0.insert(
        name.to_string(),
        PersistedCreds { data, expires_at },
    );

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
                    let html = r#"<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Authorization Complete</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; padding: 24px; }
    </style>
    <script>
      (function() {
        function tryClose() {
          try { window.open('', '_self'); } catch (e) {}
          try { window.close(); } catch (e) {}
        }
        // Try immediately and after a short delay as a fallback
        tryClose();
        setTimeout(tryClose, 150);
      })();
    </script>
  </head>
  <body>
    <h1>Authorization Complete</h1>
    <p>You can close this window. It should close automatically.</p>
  </body>
</html>"#;
                    (StatusCode::OK, Html(html.to_string()))
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
                    // cache tools list and update count
                    let mapped: Vec<crate::types::ToolInfo> = tools
                        .iter()
                        .map(|t| crate::types::ToolInfo {
                            name: t.name.to_string(),
                            description: t.description.clone().map(|s| s.to_string()),
                            input_schema: None,
                        })
                        .collect();
                    crate::tools_cache::set(name, mapped.clone()).await;
                    overlay::set_error(name, None).await;
                    overlay::set_state(name, ClientConnectionState::Connected).await;
                    overlay::set_oauth_authenticated(name, true).await;
                    overlay::set_auth_required(name, false).await;
                    crate::overlay::set_tools(name, mapped.len() as u32).await;
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
