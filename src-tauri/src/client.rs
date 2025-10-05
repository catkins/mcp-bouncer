use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, SystemTime},
};

use rmcp::ServiceExt;
use rmcp::service::RoleClient;
use rmcp::transport::{
    SseClientTransport, StreamableHttpClientTransport, TokioChildProcess,
    auth::{AuthClient, AuthError, OAuthClientConfig, OAuthState},
    sse_client::SseClientConfig,
    streamable_http_client::{
        StreamableHttpClient, StreamableHttpClientTransportConfig, StreamableHttpError,
    },
};

use crate::config::{MCPServerConfig, TransportType};
use crate::events::EventEmitter;
use crate::logging::RpcEventPublisher;
use crate::oauth::{
    LoadedOAuthCredentials, load_credentials_entry, on_possible_unauthorized, save_credentials_for,
};
use crate::transport::intercepting::{InterceptingClientTransport, RequestLogContext};

use anyhow::{Context, Result, anyhow};
use tokio::sync::Mutex as AsyncMutex;
use tracing::warn;

pub type ClientService = rmcp::service::RunningService<RoleClient, ()>;
pub type ClientRegistry = tokio::sync::Mutex<HashMap<String, Arc<ClientService>>>;

// Global client registry used by Tauri commands
static CLIENT_REGISTRY_INST: std::sync::OnceLock<ClientRegistry> = std::sync::OnceLock::new();

pub fn client_registry() -> &'static ClientRegistry {
    CLIENT_REGISTRY_INST.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

pub async fn ensure_rmcp_client<E, L>(
    name: &str,
    cfg: &MCPServerConfig,
    emitter: &E,
    logger: &L,
) -> Result<Arc<ClientService>>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    let emitter = emitter.clone();
    let logger = logger.clone();
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
            if let Some(creds) = load_credentials_entry(&crate::config::OsConfigProvider, &cfg.name)
            {
                let LoadedOAuthCredentials {
                    client_id,
                    client_secret,
                    redirect_uri,
                    token,
                    expires_at,
                } = creds;
                // derive base url for oauth state machine
                let url = reqwest::Url::parse(&endpoint).context("url parse")?;
                let mut base = url.clone();
                base.set_path("");

                let mut state = OAuthState::new(base.as_str(), None)
                    .await
                    .context("oauth init")?;
                state
                    .set_credentials(&client_id, token.clone())
                    .await
                    .context("oauth set")?;
                let mut manager = state
                    .into_authorization_manager()
                    .ok_or_else(|| anyhow!("oauth state"))?;
                if let Some(ref secret) = client_secret {
                    if let Some(ref redirect) = redirect_uri {
                        let config = OAuthClientConfig {
                            client_id: client_id.clone(),
                            client_secret: Some(secret.clone()),
                            scopes: vec![],
                            redirect_uri: redirect.clone(),
                        };
                        if let Err(err) = manager.configure_client(config) {
                            warn!(
                                target = "oauth",
                                server = %cfg.name,
                                "failed to restore oauth client secret: {}",
                                err
                            );
                        }
                    } else {
                        warn!(
                            target = "oauth",
                            server = %cfg.name,
                            "stored OAuth secret without redirect uri; skipping secret restore"
                        );
                    }
                }
                let client = AuthClient::new(reqwest::Client::default(), manager);
                let client = RefreshingAuthClient::new(
                    cfg.name.clone(),
                    client_id,
                    client_secret,
                    redirect_uri,
                    expires_at,
                    client,
                );
                let transport = StreamableHttpClientTransport::with_client(
                    client,
                    StreamableHttpClientTransportConfig::with_uri(endpoint.clone()),
                );
                let transport = InterceptingClientTransport::new(
                    transport,
                    cfg.name.clone(),
                    emitter.clone(),
                    logger.clone(),
                );
                match ().serve(transport).await {
                    Ok(svc) => svc,
                    Err(e) => {
                        on_possible_unauthorized(&cfg.name, Some(&endpoint)).await;
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
                    .connection_verbose(true)
                    .build()
                    .context("http client build")?;
                let transport = StreamableHttpClientTransport::with_client(
                    client,
                    StreamableHttpClientTransportConfig::with_uri(endpoint.clone()),
                );
                let transport = InterceptingClientTransport::new(
                    transport,
                    cfg.name.clone(),
                    emitter.clone(),
                    logger.clone(),
                );
                match ().serve(transport).await {
                    Ok(svc) => svc,
                    Err(e) => {
                        on_possible_unauthorized(&cfg.name, Some(&endpoint)).await;
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
            let transport = InterceptingClientTransport::new(
                transport,
                cfg.name.clone(),
                emitter.clone(),
                logger.clone(),
            );
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
            let transport = InterceptingClientTransport::new(
                transport,
                cfg.name.clone(),
                emitter.clone(),
                logger.clone(),
            );
            ().serve(transport).await.context("rmcp serve")?
        }
    };
    let arc = Arc::new(service);
    guard.insert(name.to_string(), arc.clone());
    tracing::info!(target = "client", server=%name, "registered");
    Ok(arc)
}

const TOKEN_REFRESH_LEEWAY: Duration = Duration::from_secs(60);

#[derive(Clone)]
struct RefreshingAuthClient {
    inner: AuthClient<reqwest::Client>,
    server_name: String,
    client_id: String,
    client_secret: Option<String>,
    redirect_uri: Option<String>,
    expires_at: Arc<AsyncMutex<Option<SystemTime>>>,
    refresh_lock: Arc<AsyncMutex<()>>,
}

impl RefreshingAuthClient {
    fn new(
        server_name: String,
        client_id: String,
        client_secret: Option<String>,
        redirect_uri: Option<String>,
        expires_at: Option<SystemTime>,
        inner: AuthClient<reqwest::Client>,
    ) -> Self {
        Self {
            inner,
            server_name,
            client_id,
            client_secret,
            redirect_uri,
            expires_at: Arc::new(AsyncMutex::new(expires_at)),
            refresh_lock: Arc::new(AsyncMutex::new(())),
        }
    }

    async fn refresh_if_needed(&self) -> Result<(), AuthError> {
        if !self.should_refresh().await {
            return Ok(());
        }

        let _guard = self.refresh_lock.lock().await;
        if !self.should_refresh().await {
            return Ok(());
        }

        let new_creds = {
            let manager = self.inner.auth_manager.lock().await;
            manager.refresh_token().await?
        };

        if let Err(err) = save_credentials_for(
            &crate::config::OsConfigProvider,
            &self.server_name,
            &self.client_id,
            self.client_secret.as_deref(),
            self.redirect_uri.as_deref(),
            new_creds.clone(),
        ) {
            warn!(target = "oauth", server = %self.server_name, "failed to persist refreshed oauth credentials: {}", err);
        }

        let next_expiry = serde_json::to_value(&new_creds)
            .ok()
            .and_then(|v| v.get("expires_in").and_then(|n| n.as_u64()))
            .and_then(|secs| SystemTime::now().checked_add(Duration::from_secs(secs)));
        let mut expires_at = self.expires_at.lock().await;
        *expires_at = next_expiry;

        Ok(())
    }

    async fn should_refresh(&self) -> bool {
        let expires_at = self.expires_at.lock().await;
        let Some(expiry) = *expires_at else {
            return false;
        };

        let now = SystemTime::now();
        match expiry.duration_since(now) {
            Ok(remaining) => remaining <= TOKEN_REFRESH_LEEWAY,
            Err(_) => true,
        }
    }
}

impl StreamableHttpClient for RefreshingAuthClient {
    type Error = reqwest::Error;

    async fn post_message(
        &self,
        uri: Arc<str>,
        message: rmcp::model::ClientJsonRpcMessage,
        session_id: Option<Arc<str>>,
        auth_token: Option<String>,
    ) -> Result<
        rmcp::transport::streamable_http_client::StreamableHttpPostResponse,
        StreamableHttpError<Self::Error>,
    > {
        self.refresh_if_needed()
            .await
            .map_err(StreamableHttpError::Auth)?;
        <AuthClient<reqwest::Client> as StreamableHttpClient>::post_message(
            &self.inner,
            uri,
            message,
            session_id,
            auth_token,
        )
        .await
    }

    async fn delete_session(
        &self,
        uri: Arc<str>,
        session_id: Arc<str>,
        auth_token: Option<String>,
    ) -> Result<(), StreamableHttpError<Self::Error>> {
        self.refresh_if_needed()
            .await
            .map_err(StreamableHttpError::Auth)?;
        <AuthClient<reqwest::Client> as StreamableHttpClient>::delete_session(
            &self.inner,
            uri,
            session_id,
            auth_token,
        )
        .await
    }

    async fn get_stream(
        &self,
        uri: Arc<str>,
        session_id: Arc<str>,
        last_event_id: Option<String>,
        auth_token: Option<String>,
    ) -> Result<
        futures::stream::BoxStream<'static, Result<sse_stream::Sse, sse_stream::Error>>,
        StreamableHttpError<Self::Error>,
    > {
        self.refresh_if_needed()
            .await
            .map_err(StreamableHttpError::Auth)?;
        <AuthClient<reqwest::Client> as StreamableHttpClient>::get_stream(
            &self.inner,
            uri,
            session_id,
            last_event_id,
            auth_token,
        )
        .await
    }
}

pub async fn apply_log_context_from_client<E, L>(
    client: &ClientService,
    cfg: &MCPServerConfig,
    ctx: &RequestLogContext<E, L>,
) where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    let (version, protocol) = if let Some(info) = client.peer().peer_info() {
        (
            Some(info.server_info.version.clone()),
            Some(info.protocol_version.to_string()),
        )
    } else {
        (None, None)
    };
    ctx.set_server_details(Some(cfg.name.clone()), version, protocol)
        .await;
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

pub async fn fetch_tools_for_cfg<E, L>(
    cfg: &MCPServerConfig,
    emitter: &E,
    logger: &L,
) -> Result<Vec<serde_json::Value>>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    let client = ensure_rmcp_client(&cfg.name, cfg, emitter, logger).await?;
    let tools = match client.list_all_tools().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(cfg.transport, TransportType::StreamableHttp) {
                on_possible_unauthorized(&cfg.name, Some(&cfg.endpoint)).await;
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
