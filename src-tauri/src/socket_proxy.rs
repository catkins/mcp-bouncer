use std::{future::Future, path::PathBuf, str::FromStr, sync::Arc};

use anyhow::{Context, Result};
use bytes::Bytes;
use futures::StreamExt;
use http_body_util::{BodyExt, Full};
use hyper::{
    Method, Request, StatusCode,
    body::Incoming,
    http::{
        self,
        header::{self, HeaderValue},
    },
};
use hyper_util::{client::legacy::Client, rt::TokioExecutor};
use hyperlocal::UnixConnector;
use rmcp::{
    ErrorData,
    model::{
        ClientCapabilities, ClientInfo, ClientNotification, ClientRequest, Implementation,
        ProtocolVersion, ServerCapabilities, ServerInfo, ServerNotification, ServerRequest,
        ServerResult,
    },
    serve_client, serve_server,
    service::{
        NotificationContext, Peer, RequestContext, RoleClient, RoleServer, RunningService, Service,
        ServiceError,
    },
    transport::{
        StreamableHttpClientTransport,
        common::http_header::{
            EVENT_STREAM_MIME_TYPE, HEADER_LAST_EVENT_ID, HEADER_SESSION_ID, JSON_MIME_TYPE,
        },
        streamable_http_client::{
            AuthRequiredError, StreamableHttpClient, StreamableHttpClientTransportConfig,
            StreamableHttpError, StreamableHttpPostResponse,
        },
    },
};
use serde_json;
use sse_stream::SseStream;
use tokio::sync::RwLock;

struct ProxyState {
    upstream_peer: RwLock<Option<Peer<RoleClient>>>,
    downstream_peer: RwLock<Option<Peer<RoleServer>>>,
    server_info: std::sync::RwLock<ServerInfo>,
}

impl ProxyState {
    fn new() -> Self {
        Self {
            upstream_peer: RwLock::new(None),
            downstream_peer: RwLock::new(None),
            server_info: std::sync::RwLock::new(default_server_info()),
        }
    }

    async fn set_upstream_peer(&self, peer: Peer<RoleClient>, info: ServerInfo) {
        *self.upstream_peer.write().await = Some(peer);
        *self.server_info.write().unwrap() = info;
    }

    async fn upstream_peer(&self) -> Result<Peer<RoleClient>, ErrorData> {
        self.upstream_peer
            .read()
            .await
            .clone()
            .ok_or_else(|| ErrorData::internal_error("upstream not ready", None))
    }

    async fn set_downstream_peer(&self, peer: Peer<RoleServer>) {
        *self.downstream_peer.write().await = Some(peer);
    }

    async fn downstream_peer(&self) -> Result<Peer<RoleServer>, ErrorData> {
        self.downstream_peer
            .read()
            .await
            .clone()
            .ok_or_else(|| ErrorData::internal_error("downstream client not initialized", None))
    }

    fn server_info_sync(&self) -> ServerInfo {
        self.server_info.read().unwrap().clone()
    }
}

#[derive(Clone)]
struct StdIoProxy {
    state: Arc<ProxyState>,
}

impl StdIoProxy {
    fn new(state: Arc<ProxyState>) -> Self {
        Self { state }
    }
}

impl Service<RoleServer> for StdIoProxy {
    fn handle_request(
        &self,
        request: ClientRequest,
        context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ServerResult, ErrorData>> + Send {
        let state = self.state.clone();
        async move {
            state.set_downstream_peer(context.peer.clone()).await;
            let peer = state.upstream_peer().await?;
            peer.send_request(request).await.map_err(map_service_error)
        }
    }

    fn handle_notification(
        &self,
        notification: ClientNotification,
        _context: NotificationContext<RoleServer>,
    ) -> impl Future<Output = Result<(), ErrorData>> + Send {
        let state = self.state.clone();
        async move {
            let peer = state.upstream_peer().await?;
            peer.send_notification(notification)
                .await
                .map_err(map_service_error)
        }
    }

    fn get_info(&self) -> ServerInfo {
        self.state.server_info_sync()
    }
}

#[derive(Clone)]
struct UpstreamBridge {
    state: Arc<ProxyState>,
}

impl UpstreamBridge {
    fn new(state: Arc<ProxyState>) -> Self {
        Self { state }
    }
}

impl Service<RoleClient> for UpstreamBridge {
    fn handle_request(
        &self,
        request: ServerRequest,
        _context: RequestContext<RoleClient>,
    ) -> impl Future<Output = Result<rmcp::model::ClientResult, ErrorData>> + Send {
        let state = self.state.clone();
        async move {
            let peer = state.downstream_peer().await?;
            peer.send_request(request).await.map_err(map_service_error)
        }
    }

    fn handle_notification(
        &self,
        notification: ServerNotification,
        _context: NotificationContext<RoleClient>,
    ) -> impl Future<Output = Result<(), ErrorData>> + Send {
        let state = self.state.clone();
        async move {
            let peer = state.downstream_peer().await?;
            peer.send_notification(notification)
                .await
                .map_err(map_service_error)
        }
    }

    fn get_info(&self) -> ClientInfo {
        ClientInfo {
            protocol_version: ProtocolVersion::default(),
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "mcp-bouncer-unix-bridge".into(),
                title: Some("Unix Socket Bridge".into()),
                version: env!("CARGO_PKG_VERSION").into(),
                icons: None,
                website_url: None,
            },
        }
    }
}

fn map_service_error(err: ServiceError) -> ErrorData {
    match err {
        ServiceError::McpError(e) => e,
        other => ErrorData::internal_error(other.to_string(), None),
    }
}

pub async fn serve_stdio<T, E, A, Fut>(
    transport: T,
    socket_path: PathBuf,
    endpoint: &str,
    shutdown: Fut,
) -> Result<()>
where
    T: rmcp::transport::IntoTransport<RoleServer, E, A> + Send + 'static,
    E: std::error::Error + Send + Sync + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    let state = Arc::new(ProxyState::new());

    let http_client = Client::builder(TokioExecutor::new()).build::<_, Full<Bytes>>(UnixConnector);
    let unix_client = UnixStreamClient::new(socket_path.clone(), endpoint.to_owned(), http_client);

    let transport_config =
        StreamableHttpClientTransportConfig::with_uri(format!("http://unix{endpoint}"));
    let upstream_transport =
        StreamableHttpClientTransport::with_client(unix_client.clone(), transport_config);

    let upstream_service = UpstreamBridge::new(state.clone());
    let upstream_running = serve_client(upstream_service, upstream_transport)
        .await
        .context("connect to MCP bouncer over unix socket")?;
    let info = upstream_running
        .peer()
        .peer_info()
        .cloned()
        .unwrap_or_else(default_server_info);
    state
        .set_upstream_peer(upstream_running.peer().clone(), info)
        .await;

    let downstream_service = StdIoProxy::new(state.clone());
    let downstream_running = serve_server(downstream_service, transport)
        .await
        .context("start stdio bridge")?;

    relay_until_shutdown(upstream_running, downstream_running, shutdown).await
}

async fn relay_until_shutdown<Fut>(
    upstream: RunningService<RoleClient, UpstreamBridge>,
    downstream: RunningService<RoleServer, StdIoProxy>,
    shutdown: Fut,
) -> Result<()>
where
    Fut: Future<Output = ()> + Send + 'static,
{
    let upstream_cancel = upstream.cancellation_token();
    let downstream_cancel = downstream.cancellation_token();

    let mut upstream_task = tokio::spawn(async move { upstream.waiting().await });
    let mut downstream_task = tokio::spawn(async move { downstream.waiting().await });

    tokio::select! {
        res = &mut downstream_task => {
            upstream_cancel.cancel();
            handle_task_result(res)?;
        }
        res = &mut upstream_task => {
            downstream_cancel.cancel();
            handle_task_result(res)?;
        }
        _ = shutdown => {
            upstream_cancel.cancel();
            downstream_cancel.cancel();
            let _ = handle_task_result(downstream_task.await);
            let _ = handle_task_result(upstream_task.await);
        }
    }

    Ok(())
}

fn handle_task_result(
    res: Result<Result<rmcp::service::QuitReason, tokio::task::JoinError>, tokio::task::JoinError>,
) -> Result<()> {
    match res {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(e.into()),
        Err(e) => Err(e.into()),
    }
}

#[derive(Clone)]
struct UnixStreamClient {
    socket_path: Arc<PathBuf>,
    endpoint: Arc<str>,
    http: Client<UnixConnector, Full<Bytes>>,
}

impl UnixStreamClient {
    fn new(
        socket_path: PathBuf,
        endpoint: String,
        http: Client<UnixConnector, Full<Bytes>>,
    ) -> Self {
        Self {
            socket_path: Arc::new(socket_path),
            endpoint: Arc::from(endpoint),
            http,
        }
    }

    fn build_uri(&self, uri: &Arc<str>) -> Result<http::Uri, StreamableHttpError<UnixClientError>> {
        let parsed = http::Uri::from_str(uri).map_err(|e| StreamableHttpError::Client(e.into()))?;
        let path = parsed.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
        Ok(hyperlocal::Uri::new(self.socket_path.as_path(), path).into())
    }

    fn default_uri(&self) -> http::Uri {
        hyperlocal::Uri::new(self.socket_path.as_path(), self.endpoint.as_ref()).into()
    }
}

#[derive(Debug)]
enum UnixClientError {
    Http(http::Error),
    Hyper(hyper::Error),
    Json(serde_json::Error),
    Uri(http::uri::InvalidUri),
    Client(hyper_util::client::legacy::Error),
}

impl std::fmt::Display for UnixClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http(e) => write!(f, "http error: {e}"),
            Self::Hyper(e) => write!(f, "hyper error: {e}"),
            Self::Json(e) => write!(f, "json error: {e}"),
            Self::Uri(e) => write!(f, "invalid uri: {e}"),
            Self::Client(e) => write!(f, "client error: {e}"),
        }
    }
}

impl std::error::Error for UnixClientError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Http(e) => Some(e),
            Self::Hyper(e) => Some(e),
            Self::Json(e) => Some(e),
            Self::Uri(e) => Some(e),
            Self::Client(e) => Some(e),
        }
    }
}

impl From<http::Error> for UnixClientError {
    fn from(value: http::Error) -> Self {
        Self::Http(value)
    }
}

impl From<hyper::Error> for UnixClientError {
    fn from(value: hyper::Error) -> Self {
        Self::Hyper(value)
    }
}

impl From<serde_json::Error> for UnixClientError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<http::uri::InvalidUri> for UnixClientError {
    fn from(value: http::uri::InvalidUri) -> Self {
        Self::Uri(value)
    }
}

impl From<hyper_util::client::legacy::Error> for UnixClientError {
    fn from(value: hyper_util::client::legacy::Error) -> Self {
        Self::Client(value)
    }
}

impl StreamableHttpClient for UnixStreamClient {
    type Error = UnixClientError;

    fn post_message(
        &self,
        uri: Arc<str>,
        message: rmcp::model::ClientJsonRpcMessage,
        session_id: Option<Arc<str>>,
        auth_header: Option<String>,
    ) -> impl Future<Output = Result<StreamableHttpPostResponse, StreamableHttpError<Self::Error>>> + Send
    {
        let client = self.clone();
        async move {
            let target_uri = if uri.is_empty() {
                client.default_uri()
            } else {
                client.build_uri(&uri)?
            };

            let mut builder = Request::builder()
                .method(Method::POST)
                .uri(target_uri)
                .header(header::ACCEPT, "text/event-stream, application/json")
                .header(header::CONTENT_TYPE, "application/json");

            if let Some(session) = session_id {
                builder = builder.header(HEADER_SESSION_ID, session.as_ref());
            }

            if let Some(token) = auth_header {
                let mut value =
                    HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| {
                        StreamableHttpError::UnexpectedServerResponse("invalid auth header".into())
                    })?;
                value.set_sensitive(true);
                builder = builder.header(header::AUTHORIZATION, value);
            }

            let body_bytes =
                serde_json::to_vec(&message).map_err(|e| StreamableHttpError::Client(e.into()))?;
            let request = builder
                .body(Full::from(Bytes::from(body_bytes)))
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            let response = client
                .http
                .request(request)
                .await
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            client.handle_post_response(response).await
        }
    }

    fn delete_session(
        &self,
        uri: Arc<str>,
        session_id: Arc<str>,
        auth_header: Option<String>,
    ) -> impl Future<Output = Result<(), StreamableHttpError<Self::Error>>> + Send {
        let client = self.clone();
        async move {
            let target_uri = if uri.is_empty() {
                client.default_uri()
            } else {
                client.build_uri(&uri)?
            };

            let mut builder = Request::builder()
                .method(Method::DELETE)
                .uri(target_uri)
                .header(HEADER_SESSION_ID, session_id.as_ref());

            if let Some(token) = auth_header {
                let mut value =
                    HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| {
                        StreamableHttpError::UnexpectedServerResponse("invalid auth header".into())
                    })?;
                value.set_sensitive(true);
                builder = builder.header(header::AUTHORIZATION, value);
            }

            let request = builder
                .body(Full::new(Bytes::new()))
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            let response = client
                .http
                .request(request)
                .await
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            match response.status() {
                StatusCode::NO_CONTENT | StatusCode::OK => Ok(()),
                status => Err(StreamableHttpError::UnexpectedServerResponse(
                    format!("unexpected delete status {status}").into(),
                )),
            }
        }
    }

    fn get_stream(
        &self,
        uri: Arc<str>,
        session_id: Arc<str>,
        last_event_id: Option<String>,
        auth_header: Option<String>,
    ) -> impl Future<
        Output = Result<
            futures::stream::BoxStream<'static, Result<sse_stream::Sse, sse_stream::Error>>,
            StreamableHttpError<Self::Error>,
        >,
    > + Send {
        let client = self.clone();
        async move {
            let target_uri = if uri.is_empty() {
                client.default_uri()
            } else {
                client.build_uri(&uri)?
            };

            let mut builder = Request::builder()
                .method(Method::GET)
                .uri(target_uri)
                .header(HEADER_SESSION_ID, session_id.as_ref())
                .header(header::ACCEPT, EVENT_STREAM_MIME_TYPE);

            if let Some(token) = auth_header {
                let mut value =
                    HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| {
                        StreamableHttpError::UnexpectedServerResponse("invalid auth header".into())
                    })?;
                value.set_sensitive(true);
                builder = builder.header(header::AUTHORIZATION, value);
            }

            if let Some(last) = last_event_id {
                builder = builder.header(HEADER_LAST_EVENT_ID, last);
            }

            let request = builder
                .body(Full::new(Bytes::new()))
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            let response = client
                .http
                .request(request)
                .await
                .map_err(|e| StreamableHttpError::Client(e.into()))?;

            if response.status() != StatusCode::OK {
                return Err(StreamableHttpError::UnexpectedServerResponse(
                    format!("unexpected stream status {}", response.status()).into(),
                ));
            }

            let content_type = response.headers().get(header::CONTENT_TYPE);
            if !matches!(content_type, Some(ct) if ct.as_bytes().starts_with(EVENT_STREAM_MIME_TYPE.as_bytes()))
            {
                return Err(StreamableHttpError::ServerDoesNotSupportSse);
            }

            Ok(SseStream::new(response.into_body()).boxed())
        }
    }
}

impl UnixStreamClient {
    async fn handle_post_response(
        &self,
        response: hyper::Response<Incoming>,
    ) -> Result<StreamableHttpPostResponse, StreamableHttpError<UnixClientError>> {
        if response.status() == StatusCode::UNAUTHORIZED {
            if let Some(header) = response.headers().get(header::WWW_AUTHENTICATE) {
                let header = header
                    .to_str()
                    .map_err(|_| {
                        StreamableHttpError::UnexpectedServerResponse(
                            "invalid WWW-Authenticate header".into(),
                        )
                    })?
                    .to_string();
                return Err(StreamableHttpError::AuthRequired(AuthRequiredError {
                    www_authenticate_header: header,
                }));
            }
        }

        let status = response.status();
        if matches!(status, StatusCode::ACCEPTED | StatusCode::NO_CONTENT) {
            return Ok(StreamableHttpPostResponse::Accepted);
        }

        let content_type = response.headers().get(header::CONTENT_TYPE);
        let session_id = response
            .headers()
            .get(HEADER_SESSION_ID)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if matches!(content_type, Some(ct) if ct.as_bytes().starts_with(EVENT_STREAM_MIME_TYPE.as_bytes()))
        {
            return Ok(StreamableHttpPostResponse::Sse(
                SseStream::new(response.into_body()).boxed(),
                session_id,
            ));
        }

        if matches!(content_type, Some(ct) if ct.as_bytes().starts_with(JSON_MIME_TYPE.as_bytes()))
        {
            let collected = response
                .into_body()
                .collect()
                .await
                .map_err(|e| StreamableHttpError::Client(e.into()))?;
            let bytes = collected.to_bytes();
            let message = serde_json::from_slice(bytes.as_ref())
                .map_err(|e| StreamableHttpError::Client(e.into()))?;
            return Ok(StreamableHttpPostResponse::Json(message, session_id));
        }

        Err(StreamableHttpError::UnexpectedContentType(
            content_type.map(|ct| String::from_utf8_lossy(ct.as_bytes()).into_owned()),
        ))
    }
}

fn default_server_info() -> ServerInfo {
    ServerInfo {
        protocol_version: ProtocolVersion::default(),
        capabilities: ServerCapabilities::default(),
        server_info: Implementation {
            name: "MCP Bouncer".into(),
            title: Some("Unix Socket Bridge".into()),
            version: env!("CARGO_PKG_VERSION").into(),
            icons: None,
            website_url: None,
        },
        instructions: None,
    }
}
