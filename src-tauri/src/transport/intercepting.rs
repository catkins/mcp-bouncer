use std::{collections::HashMap, future::Future, sync::Arc, time::Instant};

use rmcp::{
    RoleClient, RoleServer,
    model::{
        self as mcp, ClientRequest, ErrorData, GetExtensions, JsonRpcMessage, RequestId,
        ServerNotification, ServerResult,
    },
    service::{RxJsonRpcMessage, TxJsonRpcMessage},
    transport::{
        Transport,
        common::server_side_http::ServerSseMessage,
        streamable_http_server::session::{SessionId, SessionManager},
    },
};
use tokio::sync::{Mutex, RwLock};

use crate::{
    events::{self, EventEmitter},
    incoming::record_connect,
    logging::{Event, RpcEventPublisher, current_request_origin},
};

#[derive(Clone)]
pub struct InterceptingTransport<T, E, L>
where
    T: Transport<RoleServer>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    inner: T,
    state: Arc<InterceptState<E, L>>,
}

impl<T, E, L> InterceptingTransport<T, E, L>
where
    T: Transport<RoleServer>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    pub fn new(inner: T, emitter: E, logger: L) -> Self {
        Self {
            inner,
            state: Arc::new(InterceptState::new(emitter, logger)),
        }
    }
}

impl<T, E, L> Transport<RoleServer> for InterceptingTransport<T, E, L>
where
    T: Transport<RoleServer>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    type Error = T::Error;

    fn send(
        &mut self,
        item: TxJsonRpcMessage<RoleServer>,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
        let state = self.state.clone();
        let cloned = item.clone();
        let fut = self.inner.send(item);
        async move {
            let res = fut.await;
            state.handle_outgoing(cloned).await;
            res
        }
    }

    fn receive(&mut self) -> impl Future<Output = Option<RxJsonRpcMessage<RoleServer>>> + Send {
        let state = self.state.clone();
        let fut = self.inner.receive();
        async move {
            let mut message = fut.await?;
            match &mut message {
                JsonRpcMessage::Request(envelope) => {
                    state
                        .handle_incoming_request(&mut envelope.request, &envelope.id)
                        .await;
                }
                JsonRpcMessage::Notification(envelope) => {
                    state.log_notification(&envelope.notification).await;
                }
                _ => {}
            }
            Some(message)
        }
    }

    fn close(&mut self) -> impl Future<Output = Result<(), Self::Error>> + Send {
        self.inner.close()
    }
}

#[derive(Clone)]
pub struct RequestLogContext<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    state: Arc<InterceptState<E, L>>,
    request_id: RequestId,
}

impl<E, L> RequestLogContext<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    pub async fn set_server_name(&self, server_name: impl Into<String>) {
        self.set_server_details(Some(server_name.into()), None, None)
            .await;
    }

    pub async fn set_server_details(
        &self,
        server_name: Option<String>,
        server_version: Option<String>,
        server_protocol: Option<String>,
    ) {
        let mut guard = self.state.pending.lock().await;
        if let Some(pending) = guard.get_mut(&self.request_id) {
            if let Some(name) = server_name {
                pending.event.server_name = Some(name);
            }
            if let Some(version) = server_version {
                pending.event.server_version = Some(version);
            }
            if let Some(protocol) = server_protocol {
                pending.event.server_protocol = Some(protocol);
            }
        }
    }

    pub async fn log_local_result(&self, result: &ServerResult) {
        self.state
            .log_local_result(self.request_id.clone(), result)
            .await;
    }
}

struct PendingRequest {
    started_at: Instant,
    event: Event,
    kind: PendingKind,
}

#[derive(Clone, Copy)]
enum PendingKind {
    Initialize,
    ListTools,
    CallTool,
    Other,
}

fn enrich_call_tool(event: &mut Event, result: &ServerResult) {
    if let ServerResult::CallToolResult(res) = result {
        let is_error = res.is_error == Some(true);
        event.ok = !is_error;
        if is_error {
            event.error = first_text_content(&res.content);
            if event.error.is_none() {
                event.error = Some("tool returned error".into());
            }
        } else {
            event.ok = true;
        }
    } else {
        event.ok = true;
    }
}

fn client_request_envelope_json(
    request: &ClientRequest,
    id: &RequestId,
) -> Option<serde_json::Value> {
    serde_json::to_value(JsonRpcMessage::<
        ClientRequest,
        mcp::ClientResult,
        mcp::ClientNotification,
    >::request(request.clone(), id.clone()))
    .ok()
}

fn client_notification_envelope_json(
    notification: &mcp::ClientNotification,
) -> Option<serde_json::Value> {
    serde_json::to_value(JsonRpcMessage::<
        ClientRequest,
        mcp::ClientResult,
        mcp::ClientNotification,
    >::notification(notification.clone()))
    .ok()
}

fn method_from_envelope_or_fallback(
    envelope: Option<&serde_json::Value>,
    fallback: &str,
) -> String {
    envelope
        .and_then(|payload| payload.get("method"))
        .and_then(|method| method.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

fn server_response_envelope_json(
    result: &ServerResult,
    id: &RequestId,
) -> Option<serde_json::Value> {
    serde_json::to_value(JsonRpcMessage::<
        mcp::ServerRequest,
        ServerResult,
        ServerNotification,
    >::response(result.clone(), id.clone()))
    .ok()
}

fn server_error_envelope_json(error: &ErrorData, id: &RequestId) -> Option<serde_json::Value> {
    serde_json::to_value(JsonRpcMessage::<
        mcp::ServerRequest,
        ServerResult,
        ServerNotification,
    >::error(error.clone(), id.clone()))
    .ok()
}

fn server_notification_envelope_json(
    notification: &ServerNotification,
) -> Option<serde_json::Value> {
    serde_json::to_value(JsonRpcMessage::<
        mcp::ServerRequest,
        ServerResult,
        ServerNotification,
    >::notification(notification.clone()))
    .ok()
}

struct InterceptState<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    emitter: E,
    logger: L,
    session_id: RwLock<Option<String>>,
    pending: Mutex<HashMap<RequestId, PendingRequest>>,
}

impl<E, L> InterceptState<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    fn new(emitter: E, logger: L) -> Self {
        Self {
            emitter,
            logger,
            session_id: RwLock::new(None),
            pending: Mutex::new(HashMap::new()),
        }
    }

    async fn current_session_id(&self) -> String {
        self.session_id
            .read()
            .await
            .clone()
            .unwrap_or_else(|| "anon".into())
    }

    async fn handle_incoming_request(
        self: &Arc<Self>,
        request: &mut ClientRequest,
        id: &RequestId,
    ) {
        let context = RequestLogContext {
            state: self.clone(),
            request_id: id.clone(),
        };
        // Ensure the context handle is available for downstream request handlers.
        request.extensions_mut().insert(context.clone());

        if let Some(pending) = self.build_pending(request, id).await {
            self.pending.lock().await.insert(id.clone(), pending);
        }
    }

    async fn handle_outgoing(self: &Arc<Self>, message: TxJsonRpcMessage<RoleServer>) {
        let Some((result, id)) = message.clone().into_result() else {
            return;
        };
        let pending = {
            let mut guard = self.pending.lock().await;
            guard.remove(&id)
        };
        let Some(mut pending) = pending else {
            return;
        };
        pending.event.duration_ms = Some(pending.started_at.elapsed().as_millis() as i64);
        match result {
            Ok(server_result) => {
                if let PendingKind::CallTool = pending.kind {
                    enrich_call_tool(&mut pending.event, &server_result);
                } else {
                    pending.event.ok = true;
                }
                pending.event.response_json = server_response_envelope_json(&server_result, &id);
            }
            Err(error) => {
                pending.event.ok = false;
                pending.event.error = Some(error.message.to_string());
                pending.event.response_json = server_error_envelope_json(&error, &id);
            }
        }
        self.logger.log_and_emit(&self.emitter, pending.event);
    }

    async fn log_local_result(&self, id: RequestId, result: &ServerResult) {
        let pending = {
            let mut guard = self.pending.lock().await;
            guard.remove(&id)
        };
        let Some(mut pending) = pending else {
            return;
        };
        pending.event.duration_ms = Some(pending.started_at.elapsed().as_millis() as i64);
        match pending.kind {
            PendingKind::CallTool => enrich_call_tool(&mut pending.event, result),
            _ => {
                pending.event.ok = true;
            }
        }
        pending.event.response_json = server_response_envelope_json(result, &id);
        self.logger.log_and_emit(&self.emitter, pending.event);
    }

    async fn log_notification(&self, notification: &mcp::ClientNotification) {
        let session_id = self.current_session_id().await;
        let mut event = Event::new("notifications/unknown", session_id);
        event.origin = Some("external".into());
        let request_json = client_notification_envelope_json(notification);
        let method =
            method_from_envelope_or_fallback(request_json.as_ref(), "notifications/unknown");
        event.request_json = request_json;
        event.method = method;
        event.ok = true;
        self.logger.log_and_emit(&self.emitter, event);
    }

    async fn build_pending(
        self: &Arc<Self>,
        request: &ClientRequest,
        id: &RequestId,
    ) -> Option<PendingRequest> {
        let request_json = client_request_envelope_json(request, id);
        match request {
            ClientRequest::InitializeRequest(req) => {
                let request_val = serde_json::to_value(req).ok();
                let session_id = if let Some(val) = request_val.as_ref() {
                    self.handle_initialize(val).await
                } else {
                    None
                };
                let session_id = match session_id {
                    Some(id) => id,
                    None => self.current_session_id().await,
                };
                let mut event = Event::new("initialize", session_id);
                event.origin = Some("external".into());
                if let Some(val) = request_val {
                    event.client_name = extract_str(
                        &val,
                        &[
                            "clientInfo.name",
                            "client_info.name",
                            "client.name",
                            "params.clientInfo.name",
                            "params.client_info.name",
                            "params.client.name",
                        ],
                    )
                    .map(|s| s.to_string());
                    event.client_version = extract_str(
                        &val,
                        &[
                            "clientInfo.version",
                            "client_info.version",
                            "client.version",
                            "params.clientInfo.version",
                            "params.client_info.version",
                            "params.client.version",
                        ],
                    )
                    .map(|s| s.to_string());
                    event.client_protocol = Some("jsonrpc-2.0".into());
                }
                let method = method_from_envelope_or_fallback(request_json.as_ref(), "initialize");
                event.request_json = request_json;
                event.method = method;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::Initialize,
                })
            }
            ClientRequest::ListToolsRequest(_) => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("tools/list", session_id);
                event.origin = Some("external".into());
                event.server_name = Some("aggregate".into());
                let method = method_from_envelope_or_fallback(request_json.as_ref(), "tools/list");
                event.request_json = request_json;
                event.method = method;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::ListTools,
                })
            }
            ClientRequest::CallToolRequest(req) => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("tools/call", session_id);
                event.origin = Some("external".into());
                let name = req.params.name.as_ref();
                if let Some(server) = name
                    .split_once("::")
                    .map(|(server, _)| server.to_string())
                    .filter(|s| !s.is_empty())
                {
                    event.server_name = Some(server);
                }
                let method = method_from_envelope_or_fallback(request_json.as_ref(), "tools/call");
                event.request_json = request_json;
                event.method = method;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::CallTool,
                })
            }
            _ => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("other", session_id);
                event.origin = Some("external".into());
                let method = method_from_envelope_or_fallback(request_json.as_ref(), "other");
                event.request_json = request_json;
                event.method = method;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::Other,
                })
            }
        }
    }

    async fn handle_initialize(&self, val: &serde_json::Value) -> Option<String> {
        let name = extract_str(
            val,
            &[
                "clientInfo.name",
                "client_info.name",
                "client.name",
                "params.clientInfo.name",
                "params.client_info.name",
                "params.client.name",
            ],
        )
        .unwrap_or("unknown")
        .to_string();
        let version = extract_str(
            val,
            &[
                "clientInfo.version",
                "client_info.version",
                "client.version",
                "params.clientInfo.version",
                "params.client_info.version",
                "params.client.version",
            ],
        )
        .unwrap_or("")
        .to_string();
        let title = extract_str(
            val,
            &[
                "clientInfo.title",
                "client_info.title",
                "title",
                "params.clientInfo.title",
                "params.client_info.title",
                "params.title",
            ],
        )
        .map(|s| s.to_string());
        let id = record_connect(name, version, title).await;
        events::incoming_clients_updated(&self.emitter, "connect");
        let mut guard = self.session_id.write().await;
        *guard = Some(id.clone());
        Some(id)
    }
}

#[derive(Clone)]
pub struct InterceptingClientTransport<T, E, L>
where
    T: Transport<RoleClient>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    inner: T,
    state: Arc<OutboundInterceptState<E, L>>,
}

impl<T, E, L> InterceptingClientTransport<T, E, L>
where
    T: Transport<RoleClient>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    pub fn new(inner: T, server_name: impl Into<String>, emitter: E, logger: L) -> Self {
        let state = Arc::new(OutboundInterceptState::new(server_name, emitter, logger));
        Self { inner, state }
    }
}

impl<T, E, L> Transport<RoleClient> for InterceptingClientTransport<T, E, L>
where
    T: Transport<RoleClient>,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    type Error = T::Error;

    fn send(
        &mut self,
        item: TxJsonRpcMessage<RoleClient>,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
        let state = self.state.clone();
        let cloned = item.clone();
        let fut = self.inner.send(item);
        async move {
            if let JsonRpcMessage::Request(envelope) = &cloned {
                state
                    .handle_client_request(&envelope.request, &envelope.id)
                    .await;
            }
            fut.await
        }
    }

    fn receive(&mut self) -> impl Future<Output = Option<RxJsonRpcMessage<RoleClient>>> + Send {
        let state = self.state.clone();
        let fut = self.inner.receive();
        async move {
            let message = fut.await?;
            if let Some((result, id)) = message.clone().into_result() {
                match result {
                    Ok(server_result) => {
                        state.handle_server_result(id, server_result).await;
                    }
                    Err(error) => {
                        state.handle_server_error(id, error).await;
                    }
                }
            } else if let Some(notification) = message.clone().into_notification() {
                state.log_server_notification(notification).await;
            }
            Some(message)
        }
    }

    fn close(&mut self) -> impl Future<Output = Result<(), Self::Error>> + Send {
        self.inner.close()
    }
}

struct OutboundInterceptState<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    emitter: E,
    logger: L,
    server_name: String,
    session_id: String,
    server_version: RwLock<Option<String>>,
    server_protocol: RwLock<Option<String>>,
    pending: Mutex<HashMap<RequestId, PendingRequest>>,
}

impl<E, L> OutboundInterceptState<E, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    fn new(server_name: impl Into<String>, emitter: E, logger: L) -> Self {
        let server_name = server_name.into();
        Self {
            emitter,
            logger,
            session_id: format!("internal::{server_name}"),
            server_name,
            server_version: RwLock::new(None),
            server_protocol: RwLock::new(None),
            pending: Mutex::new(HashMap::new()),
        }
    }

    async fn handle_client_request(&self, request: &ClientRequest, id: &RequestId) {
        if let Some(pending) = self.build_pending(request, id).await {
            self.pending.lock().await.insert(id.clone(), pending);
        }
    }

    async fn handle_server_result(&self, id: RequestId, result: ServerResult) {
        let pending = {
            let mut guard = self.pending.lock().await;
            guard.remove(&id)
        };
        let Some(mut pending) = pending else {
            return;
        };
        pending.event.duration_ms = Some(pending.started_at.elapsed().as_millis() as i64);
        match pending.kind {
            PendingKind::CallTool => enrich_call_tool(&mut pending.event, &result),
            _ => {
                pending.event.ok = true;
            }
        }
        pending.event.response_json = server_response_envelope_json(&result, &id);
        if let ServerResult::InitializeResult(res) = &result {
            pending.event.server_version = Some(res.server_info.version.clone());
            pending.event.server_protocol = Some(res.protocol_version.to_string());
            {
                let mut guard = self.server_version.write().await;
                *guard = Some(res.server_info.version.clone());
            }
            {
                let mut guard = self.server_protocol.write().await;
                *guard = Some(res.protocol_version.to_string());
            }
        } else {
            self.populate_server_details(&mut pending.event).await;
        }
        self.logger.log_and_emit(&self.emitter, pending.event);
    }

    async fn handle_server_error(&self, id: RequestId, error: ErrorData) {
        let pending = {
            let mut guard = self.pending.lock().await;
            guard.remove(&id)
        };
        let Some(mut pending) = pending else {
            return;
        };
        pending.event.duration_ms = Some(pending.started_at.elapsed().as_millis() as i64);
        pending.event.ok = false;
        pending.event.error = Some(error.message.to_string());
        pending.event.response_json = server_error_envelope_json(&error, &id);
        self.populate_server_details(&mut pending.event).await;
        self.logger.log_and_emit(&self.emitter, pending.event);
    }

    async fn log_server_notification(&self, notification: ServerNotification) {
        let mut event = Event::new("notifications/unknown", self.session_id.clone());
        event.server_name = Some(self.server_name.clone());
        event.origin = current_request_origin().or_else(|| Some("internal".into()));
        if let Some(origin) = event.origin.clone() {
            event.session_id = format!("{origin}::{}", self.server_name);
        }
        let request_json = server_notification_envelope_json(&notification);
        let method =
            method_from_envelope_or_fallback(request_json.as_ref(), "notifications/unknown");
        event.request_json = request_json;
        event.method = method;
        self.populate_server_details(&mut event).await;
        self.logger.log_and_emit(&self.emitter, event);
    }

    async fn build_pending(
        &self,
        request: &ClientRequest,
        id: &RequestId,
    ) -> Option<PendingRequest> {
        let request_json = client_request_envelope_json(request, id);
        let session_id = self.session_id.clone();
        let (mut event, kind) = match request {
            ClientRequest::InitializeRequest(_req) => {
                let mut event = Event::new("initialize", session_id);
                event.origin = Some("internal".into());
                event.server_name = Some(self.server_name.clone());
                if let Some(val) = request_json.as_ref() {
                    event.client_name = extract_str(
                        val,
                        &[
                            "clientInfo.name",
                            "client_info.name",
                            "client.name",
                            "params.clientInfo.name",
                            "params.client_info.name",
                            "params.client.name",
                        ],
                    )
                    .map(|s| s.to_string());
                    event.client_version = extract_str(
                        val,
                        &[
                            "clientInfo.version",
                            "client_info.version",
                            "client.version",
                            "params.clientInfo.version",
                            "params.client_info.version",
                            "params.client.version",
                        ],
                    )
                    .map(|s| s.to_string());
                    event.client_protocol = Some("jsonrpc-2.0".into());
                }
                (event, PendingKind::Initialize)
            }
            ClientRequest::ListToolsRequest(_) => {
                let mut event = Event::new("tools/list", session_id);
                event.origin = Some("internal".into());
                event.server_name = Some(self.server_name.clone());
                (event, PendingKind::ListTools)
            }
            ClientRequest::CallToolRequest(_) => {
                let mut event = Event::new("tools/call", session_id);
                event.origin = Some("internal".into());
                event.server_name = Some(self.server_name.clone());
                (event, PendingKind::CallTool)
            }
            _ => {
                let mut event = Event::new("other", session_id);
                event.origin = Some("internal".into());
                event.server_name = Some(self.server_name.clone());
                (event, PendingKind::Other)
            }
        };
        let fallback = match kind {
            PendingKind::Initialize => "initialize",
            PendingKind::ListTools => "tools/list",
            PendingKind::CallTool => "tools/call",
            PendingKind::Other => "other",
        };
        let method = method_from_envelope_or_fallback(request_json.as_ref(), fallback);
        event.request_json = request_json;
        event.method = method;
        if let Some(origin) = current_request_origin() {
            event.origin = Some(origin.clone());
            event.session_id = format!("{origin}::{}", self.server_name);
        }
        if !matches!(kind, PendingKind::Initialize) {
            self.populate_server_details(&mut event).await;
        }
        Some(PendingRequest {
            started_at: Instant::now(),
            event,
            kind,
        })
    }

    async fn populate_server_details(&self, event: &mut Event) {
        if event.server_version.is_none()
            && let Some(version) = self.server_version.read().await.clone()
        {
            event.server_version = Some(version);
        }
        if event.server_protocol.is_none()
            && let Some(protocol) = self.server_protocol.read().await.clone()
        {
            event.server_protocol = Some(protocol);
        }
    }
}

#[derive(Clone)]
pub struct InterceptingSessionManager<M, E, L>
where
    M: SessionManager,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    inner: Arc<M>,
    emitter: E,
    logger: L,
}

impl<M, E, L> InterceptingSessionManager<M, E, L>
where
    M: SessionManager,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    pub fn new(inner: M, emitter: E, logger: L) -> Self {
        Self {
            inner: Arc::new(inner),
            emitter,
            logger,
        }
    }
}

impl<M, E, L> SessionManager for InterceptingSessionManager<M, E, L>
where
    M: SessionManager,
    E: EventEmitter + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    type Error = M::Error;
    type Transport = InterceptingTransport<M::Transport, E, L>;

    fn create_session(
        &self,
    ) -> impl Future<Output = Result<(SessionId, Self::Transport), Self::Error>> + Send {
        let inner = self.inner.clone();
        let emitter = self.emitter.clone();
        let logger = self.logger.clone();
        async move {
            let (id, transport) = inner.create_session().await?;
            let wrapped = InterceptingTransport::new(transport, emitter, logger);
            Ok((id, wrapped))
        }
    }

    fn initialize_session(
        &self,
        id: &SessionId,
        message: mcp::ClientJsonRpcMessage,
    ) -> impl Future<Output = Result<mcp::ServerJsonRpcMessage, Self::Error>> + Send {
        self.inner.initialize_session(id, message)
    }

    fn has_session(
        &self,
        id: &SessionId,
    ) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        self.inner.has_session(id)
    }

    fn close_session(
        &self,
        id: &SessionId,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        self.inner.close_session(id)
    }

    fn create_stream(
        &self,
        id: &SessionId,
        message: mcp::ClientJsonRpcMessage,
    ) -> impl Future<
        Output = Result<
            impl futures::Stream<Item = ServerSseMessage> + Send + Sync + 'static,
            Self::Error,
        >,
    > + Send {
        self.inner.create_stream(id, message)
    }

    fn accept_message(
        &self,
        id: &SessionId,
        message: mcp::ClientJsonRpcMessage,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        self.inner.accept_message(id, message)
    }

    fn create_standalone_stream(
        &self,
        id: &SessionId,
    ) -> impl Future<
        Output = Result<
            impl futures::Stream<Item = ServerSseMessage> + Send + Sync + 'static,
            Self::Error,
        >,
    > + Send {
        self.inner.create_standalone_stream(id)
    }

    fn resume(
        &self,
        id: &SessionId,
        last_event_id: String,
    ) -> impl Future<
        Output = Result<
            impl futures::Stream<Item = ServerSseMessage> + Send + Sync + 'static,
            Self::Error,
        >,
    > + Send {
        self.inner.resume(id, last_event_id)
    }
}

fn extract_str<'a>(val: &'a serde_json::Value, paths: &[&str]) -> Option<&'a str> {
    for path in paths {
        let mut cur = val;
        let mut ok = true;
        for seg in path.split('.') {
            if let Some(obj) = cur.as_object() {
                if let Some(next) = obj.get(seg) {
                    cur = next;
                } else {
                    ok = false;
                    break;
                }
            } else {
                ok = false;
                break;
            }
        }
        if ok && let Some(s) = cur.as_str() {
            return Some(s);
        }
    }
    None
}

fn first_text_content(content: &[mcp::Content]) -> Option<String> {
    content
        .iter()
        .find_map(|c| c.as_text().map(|text| text.text.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{BufferingEventEmitter, EVENT_INCOMING_CLIENTS_UPDATED};
    use crate::incoming;
    use crate::logging::with_request_origin;
    use tokio::sync::mpsc;

    #[derive(Clone, Default)]
    struct TestLogger(Arc<std::sync::Mutex<Vec<Event>>>);

    impl TestLogger {
        fn take(&self) -> Vec<Event> {
            let mut guard = self.0.lock().unwrap();
            let out = guard.clone();
            guard.clear();
            out
        }
    }

    impl RpcEventPublisher for TestLogger {
        fn init_with(
            &self,
            _cp: &dyn crate::config::ConfigProvider,
            _settings: &crate::config::Settings,
        ) {
        }

        fn log(&self, event: Event) {
            self.0.lock().unwrap().push(event);
        }

        fn log_and_emit<E: EventEmitter>(&self, emitter: &E, event: Event) {
            crate::events::logs_rpc_event(emitter, &event);
            self.log(event);
        }
    }

    struct MockTransport {
        incoming: mpsc::Receiver<RxJsonRpcMessage<RoleServer>>,
        outgoing: mpsc::Sender<TxJsonRpcMessage<RoleServer>>,
    }

    impl MockTransport {
        fn new(
            incoming: mpsc::Receiver<RxJsonRpcMessage<RoleServer>>,
        ) -> (Self, mpsc::Receiver<TxJsonRpcMessage<RoleServer>>) {
            let (out_tx, out_rx) = mpsc::channel(4);
            (
                Self {
                    incoming,
                    outgoing: out_tx,
                },
                out_rx,
            )
        }
    }

    #[derive(Debug)]
    struct MockTransportError;

    impl std::fmt::Display for MockTransportError {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "mock transport closed")
        }
    }

    impl std::error::Error for MockTransportError {}

    impl Transport<RoleServer> for MockTransport {
        type Error = MockTransportError;

        fn send(
            &mut self,
            item: TxJsonRpcMessage<RoleServer>,
        ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
            let tx = self.outgoing.clone();
            async move {
                tx.send(item).await.map_err(|_| MockTransportError)?;
                Ok(())
            }
        }

        fn receive(&mut self) -> impl Future<Output = Option<RxJsonRpcMessage<RoleServer>>> + Send {
            self.incoming.recv()
        }

        fn close(&mut self) -> impl Future<Output = Result<(), Self::Error>> + Send {
            let tx = self.outgoing.clone();
            async move {
                tx.closed().await;
                Ok(())
            }
        }
    }

    #[tokio::test]
    async fn logs_call_tool_response() {
        let emitter = BufferingEventEmitter::default();
        let logger = TestLogger::default();
        let (incoming_tx, incoming_rx) = mpsc::channel(1);

        let request_id = mcp::RequestId::Number(1);
        let call_req = mcp::CallToolRequest::new(mcp::CallToolRequestParam {
            name: "srv::tool".into(),
            arguments: None,
        });
        let client_message = mcp::ClientJsonRpcMessage::request(
            mcp::ClientRequest::CallToolRequest(call_req),
            request_id.clone(),
        );
        incoming_tx.send(client_message).await.unwrap();

        let (mock_transport, _out_rx) = MockTransport::new(incoming_rx);
        let mut transport =
            InterceptingTransport::new(mock_transport, emitter.clone(), logger.clone());

        let mut message = transport.receive().await.expect("message");
        let ctx = match &mut message {
            JsonRpcMessage::Request(envelope) => envelope
                .request
                .extensions()
                .get::<RequestLogContext<BufferingEventEmitter, TestLogger>>()
                .cloned()
                .expect("log context"),
            _ => panic!("expected request"),
        };
        ctx.set_server_details(
            Some("srv".into()),
            Some("1.2.3".into()),
            Some("jsonrpc-2.0".into()),
        )
        .await;

        let server_result = mcp::ServerResult::CallToolResult(mcp::CallToolResult::success(vec![
            mcp::Content::text("done"),
        ]));
        let response = TxJsonRpcMessage::<RoleServer>::response(server_result, request_id);
        transport.send(response).await.unwrap();

        let events = logger.take();
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.method, "tools/call");
        assert_eq!(event.origin.as_deref(), Some("external"));
        assert_eq!(event.server_name.as_deref(), Some("srv"));
        assert_eq!(event.server_version.as_deref(), Some("1.2.3"));
        assert_eq!(event.server_protocol.as_deref(), Some("jsonrpc-2.0"));
        assert!(event.ok);
        let request_json = event.request_json.as_ref().expect("request json");
        let request_obj = request_json.as_object().expect("request json object");
        assert_eq!(
            request_obj.get("jsonrpc").and_then(|v| v.as_str()),
            Some("2.0"),
            "request jsonrpc version"
        );
        assert_eq!(request_obj.get("id"), Some(&serde_json::json!(1)));
        assert_eq!(
            request_obj.get("method").and_then(|v| v.as_str()),
            Some("tools/call"),
            "request method"
        );
        let response_json = event.response_json.as_ref().expect("response json");
        let response_obj = response_json.as_object().expect("response json object");
        assert_eq!(
            response_obj.get("jsonrpc").and_then(|v| v.as_str()),
            Some("2.0"),
            "response jsonrpc version"
        );
        assert_eq!(response_obj.get("id"), Some(&serde_json::json!(1)));
        assert!(
            response_obj
                .get("result")
                .and_then(|v| v.get("content"))
                .is_some(),
            "response result content present"
        );
    }

    #[tokio::test]
    async fn logs_initialize_and_emits_incoming() {
        incoming::clear_incoming().await;
        let emitter = BufferingEventEmitter::default();
        let logger = TestLogger::default();
        let (incoming_tx, incoming_rx) = mpsc::channel(1);

        let request_id = mcp::RequestId::Number(42);
        let init_req = mcp::InitializeRequest::new(mcp::InitializeRequestParam {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ClientCapabilities::default(),
            client_info: mcp::Implementation {
                name: "cli".into(),
                title: Some("Client".into()),
                version: "0.1.0".into(),
                icons: None,
                website_url: None,
            },
        });
        let client_message = mcp::ClientJsonRpcMessage::request(
            mcp::ClientRequest::InitializeRequest(init_req),
            request_id.clone(),
        );
        incoming_tx.send(client_message).await.unwrap();

        let (mock_transport, _out_rx) = MockTransport::new(incoming_rx);
        let mut transport =
            InterceptingTransport::new(mock_transport, emitter.clone(), logger.clone());

        let message = transport.receive().await.expect("message");
        match message {
            JsonRpcMessage::Request(ref envelope) => {
                assert!(
                    envelope
                        .request
                        .extensions()
                        .get::<RequestLogContext<BufferingEventEmitter, TestLogger>>()
                        .is_some()
                );
            }
            _ => panic!("expected request"),
        }

        let init_result = mcp::InitializeResult {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder().enable_logging().build(),
            server_info: mcp::Implementation {
                name: "srv".into(),
                title: None,
                version: "1.0.0".into(),
                icons: None,
                website_url: None,
            },
            instructions: Some("welcome".into()),
        };
        let response = TxJsonRpcMessage::<RoleServer>::response(
            mcp::ServerResult::InitializeResult(init_result),
            request_id,
        );
        transport.send(response).await.unwrap();

        let events = logger.take();
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event.method, "initialize");
        assert_eq!(event.origin.as_deref(), Some("external"));
        assert_eq!(event.client_name.as_deref(), Some("cli"));
        assert!(event.ok);
        let request_json = event.request_json.as_ref().expect("request json");
        let request_obj = request_json.as_object().expect("request json object");
        assert_eq!(
            request_obj.get("jsonrpc").and_then(|v| v.as_str()),
            Some("2.0"),
            "initialize request jsonrpc"
        );
        assert_eq!(request_obj.get("id"), Some(&serde_json::json!(42)));
        assert_eq!(
            request_obj.get("method").and_then(|v| v.as_str()),
            Some("initialize"),
            "initialize request method"
        );
        let response_json = event.response_json.as_ref().expect("response json");
        let response_obj = response_json.as_object().expect("response json object");
        assert_eq!(
            response_obj.get("jsonrpc").and_then(|v| v.as_str()),
            Some("2.0"),
            "initialize response jsonrpc"
        );
        assert_eq!(response_obj.get("id"), Some(&serde_json::json!(42)));
        assert!(
            response_obj
                .get("result")
                .and_then(|v| v.get("serverInfo"))
                .is_some(),
            "initialize response includes server info"
        );

        let emitted = emitter.0.lock().unwrap().clone();
        assert!(emitted.iter().any(|(name, payload)| {
            name == EVENT_INCOMING_CLIENTS_UPDATED && payload["reason"] == "connect"
        }));

        incoming::clear_incoming().await;
    }

    #[tokio::test]
    async fn outbound_defaults_to_internal_origin() {
        let emitter = BufferingEventEmitter::default();
        let logger = TestLogger::default();
        let state = OutboundInterceptState::new("srv", emitter, logger);
        let request_id = mcp::RequestId::Number(7);
        let request = mcp::ClientRequest::CallToolRequest(mcp::CallToolRequest::new(
            mcp::CallToolRequestParam {
                name: "srv::tool".into(),
                arguments: None,
            },
        ));
        let pending = state
            .build_pending(&request, &request_id)
            .await
            .expect("pending");
        assert_eq!(pending.event.origin.as_deref(), Some("internal"));
        assert_eq!(pending.event.session_id, "internal::srv");
    }

    #[tokio::test]
    async fn outbound_respects_debugger_origin_scope() {
        let emitter = BufferingEventEmitter::default();
        let logger = TestLogger::default();
        let state = OutboundInterceptState::new("srv", emitter, logger);
        let request_id = mcp::RequestId::Number(11);
        let request = mcp::ClientRequest::CallToolRequest(mcp::CallToolRequest::new(
            mcp::CallToolRequestParam {
                name: "srv::tool".into(),
                arguments: None,
            },
        ));
        let pending = with_request_origin("debugger", || async {
            state.build_pending(&request, &request_id).await
        })
        .await
        .expect("pending");
        assert_eq!(pending.event.origin.as_deref(), Some("debugger"));
        assert_eq!(pending.event.session_id, "debugger::srv");
    }
}
