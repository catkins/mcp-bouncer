use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::response::Html;
use axum::{Router, extract::Query, http::StatusCode, routing::get};
use rmcp::transport::auth::{OAuthState, OAuthTokenResponse};

use crate::client::ensure_rmcp_client;
use crate::config::{ClientConnectionState, ConfigProvider, OsConfigProvider, load_settings_with};
use crate::events::{EventEmitter, client_error, client_status_changed};
use crate::logging::RpcEventPublisher;
use crate::overlay;
use anyhow::{Context, Result, anyhow};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);
const SERVER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

const CALLBACK_HTML: &str = r#"<!doctype html>
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
                if rel < 0 {
                    rel = 0;
                }
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

    map.0
        .insert(name.to_string(), PersistedCreds { data, expires_at });

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
    state: Option<String>,
}

/// Start an OAuth flow for a server. Spawns a temporary callback server on localhost, opens the browser,
/// handles the code exchange, persists credentials to XDG config, and updates overlay status.
pub async fn start_oauth_for_server<E, L>(
    emitter: &E,
    logger: &L,
    name: &str,
    endpoint: &str,
) -> Result<()>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    let result = start_oauth_inner(emitter, logger, name, endpoint).await;

    if let Err(err) = &result {
        overlay::set_error(name, Some(err.to_string())).await;
        overlay::set_state(name, ClientConnectionState::Errored).await;
        overlay::set_oauth_authenticated(name, false).await;
        overlay::set_auth_required(name, true).await;
        client_error(emitter, name, "oauth", &err.to_string());
        client_status_changed(emitter, name, "error");
    }

    result
}

async fn start_oauth_inner<E, L>(emitter: &E, logger: &L, name: &str, endpoint: &str) -> Result<()>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
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

    // Spawn callback server to capture auth code
    let (callback_tx, callback_rx) = tokio::sync::oneshot::channel::<CallbackQuery>();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let callback_shared = Arc::new(Mutex::new(Some(callback_tx)));
    let shutdown_shared = Arc::new(Mutex::new(Some(shutdown_tx)));
    let app = Router::new().route(
        "/callback",
        get({
            let callback_shared = callback_shared.clone();
            let shutdown_shared = shutdown_shared.clone();
            move |Query(q): Query<CallbackQuery>| {
                let callback_shared = callback_shared.clone();
                let shutdown_shared = shutdown_shared.clone();
                async move {
                    if let Some(sender) = callback_shared.lock().unwrap().take() {
                        let _ = sender.send(q);
                    }
                    if let Some(shutdown) = shutdown_shared.lock().unwrap().take() {
                        let _ = shutdown.send(());
                    }
                    (StatusCode::OK, Html(CALLBACK_HTML.to_string()))
                }
            }
        }),
    );
    let server_handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
        {
            tracing::error!(target = "oauth", "callback server error: {}", e);
        }
    });

    let shutdown_for_block = shutdown_shared.clone();

    let outcome: Result<()> = async {
        // Initialize OAuth state machine with defensive request timeouts
        let mut state =
            match tokio::time::timeout(REQUEST_TIMEOUT, OAuthState::new(base.as_str(), None)).await
            {
                Ok(res) => res.context("oauth init")?,
                Err(_) => {
                    return Err(anyhow!(
                        "oauth init timed out after {} seconds",
                        REQUEST_TIMEOUT.as_secs()
                    ));
                }
            };

        match tokio::time::timeout(
            REQUEST_TIMEOUT,
            state.start_authorization(&["mcp"], &redirect_uri, Some("mcp-bouncer")),
        )
        .await
        {
            Ok(res) => res.context("oauth start")?,
            Err(_) => {
                return Err(anyhow!(
                    "oauth start timed out after {} seconds",
                    REQUEST_TIMEOUT.as_secs()
                ));
            }
        }

        let auth_url = state.get_authorization_url().await.context("oauth url")?;

        // Open system browser to authorization URL
        let _ = open::that_detached(auth_url.clone());

        // Wait for callback
        let q = match tokio::time::timeout(CALLBACK_TIMEOUT, callback_rx).await {
            Ok(res) => res.context("callback wait")?,
            Err(_) => {
                return Err(anyhow!(
                    "oauth callback timed out after {} seconds",
                    CALLBACK_TIMEOUT.as_secs()
                ));
            }
        };

        // Signal the server that we're done listening for callbacks
        if let Some(shutdown) = shutdown_for_block.lock().unwrap().take() {
            let _ = shutdown.send(());
        }

        // Complete the code exchange
        let csrf_token = q
            .state
            .as_deref()
            .ok_or_else(|| anyhow!("oauth callback missing state parameter"))?;

        match tokio::time::timeout(REQUEST_TIMEOUT, state.handle_callback(&q.code, csrf_token)).await {
            Ok(res) => res.context("oauth exchange")?,
            Err(_) => {
                return Err(anyhow!(
                    "oauth exchange timed out after {} seconds",
                    REQUEST_TIMEOUT.as_secs()
                ));
            }
        }

        // Try to export credentials for persistence if supported
        if let Ok((_, Some(creds))) = state.get_credentials().await
            && let Err(err) = save_credentials_for(&OsConfigProvider, name, creds)
        {
            tracing::warn!(
                target = "oauth",
                "failed to persist oauth credentials for {}: {}",
                name,
                err
            );
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
            match ensure_rmcp_client(name, &cfg, emitter, logger).await {
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
    .await;

    // Ensure the callback server is shut down once we have a result (success or error)
    if let Some(shutdown) = shutdown_shared.lock().unwrap().take() {
        let _ = shutdown.send(());
    }
    match tokio::time::timeout(SERVER_SHUTDOWN_TIMEOUT, server_handle).await {
        Ok(Ok(())) => {}
        Ok(Err(err)) => {
            if !err.is_cancelled() {
                tracing::warn!(
                    target = "oauth",
                    "callback server task join failed: {}",
                    err
                );
            }
        }
        Err(_) => {
            tracing::warn!(
                target = "oauth",
                "callback server shutdown timed out; callback task cancelled"
            );
        }
    }

    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[derive(Clone)]
    struct TempConfigProvider {
        base: PathBuf,
    }

    impl TempConfigProvider {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let tid = format!("{:?}", std::thread::current().id());
            let dir = std::env::temp_dir().join(format!(
                "mcp-bouncer-oauth-test-{}-{}-{}",
                std::process::id(),
                tid,
                stamp
            ));
            fs::create_dir_all(&dir).unwrap();
            Self { base: dir }
        }
    }

    impl ConfigProvider for TempConfigProvider {
        fn base_dir(&self) -> PathBuf {
            self.base.clone()
        }
    }

    #[test]
    fn save_and_load_preserves_tokens_and_expires_in() {
        let cp = TempConfigProvider::new();
        let creds_value = json!({
            "access_token": "abc",
            "refresh_token": "def",
            "token_type": "Bearer",
            "expires_in": 3600
        });
        let creds: OAuthTokenResponse = serde_json::from_value(creds_value.clone()).unwrap();

        save_credentials_for(&cp, "srv", creds).unwrap();

        let raw = fs::read(oauth_path(&cp)).unwrap();
        let parsed: OAuthFileV2 = serde_json::from_slice(&raw).unwrap();
        let stored = parsed.0.get("srv").expect("persisted creds entry");
        assert!(stored.expires_at.is_some());

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let expires_at = stored.expires_at.unwrap();
        assert!(expires_at >= now);
        assert!(expires_at <= now + 3600 + 2); // allow small clock skew

        let loaded = load_credentials_for(&cp, "srv").expect("loaded creds");
        let loaded_json = serde_json::to_value(&loaded).unwrap();
        assert_eq!(loaded_json["access_token"], creds_value["access_token"]);
        assert_eq!(loaded_json["refresh_token"], creds_value["refresh_token"]);
        assert_eq!(
            loaded_json["token_type"]
                .as_str()
                .unwrap()
                .to_ascii_lowercase(),
            creds_value["token_type"]
                .as_str()
                .unwrap()
                .to_ascii_lowercase()
        );
        let expires_in = loaded_json["expires_in"].as_u64().unwrap();
        assert!(expires_in <= 3600);
        assert!(expires_in > 0);
    }

    #[test]
    fn save_handles_missing_expires_in() {
        let cp = TempConfigProvider::new();
        let creds: OAuthTokenResponse = serde_json::from_value(json!({
            "access_token": "zzz",
            "token_type": "Bearer"
        }))
        .unwrap();

        save_credentials_for(&cp, "srv", creds).unwrap();

        let raw = fs::read(oauth_path(&cp)).unwrap();
        let parsed: OAuthFileV2 = serde_json::from_slice(&raw).unwrap();
        let stored = parsed.0.get("srv").expect("persisted creds entry");
        assert!(stored.expires_at.is_none());

        let loaded = load_credentials_for(&cp, "srv").expect("loaded creds");
        let loaded_json = serde_json::to_value(&loaded).unwrap();
        assert!(loaded_json.get("expires_in").is_none());
    }
}
