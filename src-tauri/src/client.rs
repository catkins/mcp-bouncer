use std::{collections::HashMap, sync::Arc};

use rmcp::ServiceExt;
use rmcp::service::RoleClient;
use rmcp::transport::{
    SseClientTransport, StreamableHttpClientTransport, TokioChildProcess,
    auth::{AuthClient, OAuthState},
    sse_client::SseClientConfig,
    streamable_http_client::StreamableHttpClientTransportConfig,
};

use crate::config::{MCPServerConfig, TransportType};
use crate::oauth::load_credentials_for;
use crate::unauthorized;

use anyhow::{Context, Result, anyhow};

pub type ClientService = rmcp::service::RunningService<RoleClient, ()>;
pub type ClientRegistry = tokio::sync::Mutex<HashMap<String, Arc<ClientService>>>;

// Global client registry used by Tauri commands
static CLIENT_REGISTRY_INST: std::sync::OnceLock<ClientRegistry> = std::sync::OnceLock::new();

pub fn client_registry() -> &'static ClientRegistry {
    CLIENT_REGISTRY_INST.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

pub async fn ensure_rmcp_client(name: &str, cfg: &MCPServerConfig) -> Result<Arc<ClientService>> {
    let reg = client_registry();
    let mut guard = reg.lock().await;
    if let Some(c) = guard.get(name) {
        return Ok(c.clone());
    }
    tracing::info!(target = "client", server=%name, transport=?cfg.transport, "starting");
    let service = match cfg.transport {
        TransportType::StreamableHttp => {
            let endpoint = cfg.endpoint.clone();
            if endpoint.is_empty() {
                return Err(anyhow!("no endpoint"));
            }

            // If credentials exist in secure store, build an authorized client; otherwise use plain client
            if let Some(creds) = load_credentials_for(&crate::config::OsConfigProvider, &cfg.name) {
                // derive base url for oauth state machine
                let url = reqwest::Url::parse(&endpoint).context("url parse")?;
                let mut base = url.clone();
                base.set_path("");

                let mut state = OAuthState::new(base.as_str(), None)
                    .await
                    .context("oauth init")?;
                state
                    .set_credentials("mcp-bouncer", creds)
                    .await
                    .context("oauth set")?;
                let manager = state
                    .into_authorization_manager()
                    .ok_or_else(|| anyhow!("oauth state"))?;
                let client = AuthClient::new(reqwest::Client::default(), manager);
                let transport = StreamableHttpClientTransport::with_client(
                    client,
                    StreamableHttpClientTransportConfig::with_uri(endpoint.clone()),
                );
                match ().serve(transport).await {
                    Ok(svc) => svc,
                    Err(e) => {
                        unauthorized::on_possible_unauthorized(&cfg.name, Some(&endpoint)).await;
                        return Err(anyhow!("rmcp serve").context(e));
                    }
                }
            } else {
                // Build reqwest client with default headers if provided
                let mut map = reqwest::header::HeaderMap::new();
                for (k, v) in &cfg.headers {
                    let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                        .with_context(|| format!("invalid header name {k}"))?;
                    let val = reqwest::header::HeaderValue::from_str(v)
                        .with_context(|| format!("invalid header value for {k}"))?;
                    map.insert(name, val);
                }
                let client = reqwest::Client::builder()
                    .default_headers(map)
                    .build()
                    .context("http client build")?;
                let transport = StreamableHttpClientTransport::with_client(
                    client,
                    StreamableHttpClientTransportConfig::with_uri(endpoint.clone()),
                );
                match ().serve(transport).await {
                    Ok(svc) => svc,
                    Err(e) => {
                        unauthorized::on_possible_unauthorized(&cfg.name, Some(&endpoint)).await;
                        return Err(anyhow!("rmcp serve").context(e));
                    }
                }
            }
        }
        TransportType::Sse => {
            let endpoint = cfg.endpoint.clone();
            if endpoint.is_empty() {
                return Err(anyhow!("no endpoint"));
            }
            // Build reqwest client with default headers if provided
            let mut map = reqwest::header::HeaderMap::new();
            for (k, v) in &cfg.headers {
                let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                    .with_context(|| format!("invalid header name {k}"))?;
                let val = reqwest::header::HeaderValue::from_str(v)
                    .with_context(|| format!("invalid header value for {k}"))?;
                map.insert(name, val);
            }
            let client = reqwest::Client::builder()
                .default_headers(map)
                .build()
                .context("sse client build")?;
            let transport = SseClientTransport::start_with_client(
                client,
                SseClientConfig {
                    sse_endpoint: endpoint.into(),
                    ..Default::default()
                },
            )
            .await
            .context("sse start")?;
            ().serve(transport).await.context("rmcp serve")?
        }
        TransportType::Stdio => {
            let cmd = cfg.command.clone();
            if cmd.is_empty() {
                return Err(anyhow!("missing command"));
            }
            let mut command = tokio::process::Command::new(cmd);
            command.args(&cfg.args);
            for (k, v) in &cfg.env {
                command.env(k, v);
            }
            let transport = TokioChildProcess::new(command).context("spawn")?;
            ().serve(transport).await.context("rmcp serve")?
        }
    };
    let arc = Arc::new(service);
    guard.insert(name.to_string(), arc.clone());
    tracing::info!(target = "client", server=%name, "registered");
    Ok(arc)
}

pub async fn remove_rmcp_client(name: &str) -> Result<()> {
    let reg = client_registry();
    let mut guard = reg.lock().await;
    if let Some(service) = guard.remove(name) {
        tracing::info!(target = "client", server=%name, "stopping");
        service.cancellation_token().cancel();
    }
    Ok(())
}

// Cancel all running clients and clear the registry
pub async fn shutdown_all_clients() {
    let reg = client_registry();
    let mut guard = reg.lock().await;
    for (_, service) in guard.drain() {
        service.cancellation_token().cancel();
    }
}

pub async fn fetch_tools_for_cfg(cfg: &MCPServerConfig) -> Result<Vec<serde_json::Value>> {
    let client = ensure_rmcp_client(&cfg.name, cfg).await?;
    let tools = match client.list_all_tools().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(cfg.transport, TransportType::StreamableHttp) {
                unauthorized::on_possible_unauthorized(&cfg.name, Some(&cfg.endpoint)).await;
            }
            return Err(anyhow!("rmcp list tools").context(e));
        }
    };
    let vals: Vec<serde_json::Value> = tools
        .into_iter()
        .map(|t| serde_json::to_value(t).unwrap_or(serde_json::json!({})))
        .collect();
    Ok(vals)
}

// Helper: expose names present in registry (for status computation)
pub async fn registry_names() -> Vec<String> {
    let reg = client_registry();
    let guard = reg.lock().await;
    guard.keys().cloned().collect()
}
