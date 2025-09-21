use std::{
    collections::HashMap,
    future::Future,
    sync::Arc,
    time::Instant,
};

use rmcp::{
    RoleServer,
    model::{self as mcp, ClientRequest, GetExtensions, JsonRpcMessage, RequestId, ServerResult},
    service::{RxJsonRpcMessage, TxJsonRpcMessage},
    transport::{
        common::server_side_http::ServerSseMessage,
        streamable_http_server::session::{SessionId, SessionManager},
        Transport,
    },
};
use tokio::sync::{Mutex, RwLock};

use crate::{
    events::{self, EventEmitter},
    incoming::record_connect,
    logging::{Event, RpcEventPublisher},
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
            if let JsonRpcMessage::Request(ref mut envelope) = message {
                state
                    .handle_incoming_request(&mut envelope.request, &envelope.id)
                    .await;
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
        self
            .set_server_details(Some(server_name.into()), None, None)
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

struct PendingRequest {
    started_at: Instant,
    event: Event,
    kind: PendingKind,
}

enum PendingKind {
    Initialize,
    ListTools,
    CallTool,
    Other,
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
        self
            .session_id
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
                    Self::enrich_call_tool(&mut pending.event, &server_result);
                } else {
                    pending.event.ok = true;
                }
                pending.event.response_json = serde_json::to_value(&server_result).ok();
            }
            Err(error) => {
                pending.event.ok = false;
                pending.event.error = Some(error.message.to_string());
                pending.event.response_json = serde_json::to_value(&error).ok();
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
            PendingKind::CallTool => Self::enrich_call_tool(&mut pending.event, result),
            _ => {
                pending.event.ok = true;
            }
        }
        pending.event.response_json = serde_json::to_value(result).ok();
        self.logger.log_and_emit(&self.emitter, pending.event);
    }

    async fn build_pending(
        self: &Arc<Self>,
        request: &ClientRequest,
        _id: &RequestId,
    ) -> Option<PendingRequest> {
        let request_json = serde_json::to_value(request).ok();
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
                event.request_json = request_json;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::Initialize,
                })
            }
            ClientRequest::ListToolsRequest(_) => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("listTools", session_id);
                event.server_name = Some("aggregate".into());
                event.request_json = request_json;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::ListTools,
                })
            }
            ClientRequest::CallToolRequest(req) => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("callTool", session_id);
                let name = req.params.name.as_ref();
                if let Some(server) = name
                    .split_once("::")
                    .map(|(server, _)| server.to_string())
                    .filter(|s| !s.is_empty())
                {
                    event.server_name = Some(server);
                }
                event.request_json = request_json;
                Some(PendingRequest {
                    started_at: Instant::now(),
                    event,
                    kind: PendingKind::CallTool,
                })
            }
            _ => {
                let session_id = self.current_session_id().await;
                let mut event = Event::new("other", session_id);
                event.request_json = request_json;
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

    fn create_session(&self) -> impl Future<Output = Result<(SessionId, Self::Transport), Self::Error>> + Send {
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

    fn has_session(&self, id: &SessionId) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        self.inner.has_session(id)
    }

    fn close_session(&self, id: &SessionId) -> impl Future<Output = Result<(), Self::Error>> + Send {
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
        fn init_with(&self, _cp: &dyn crate::config::ConfigProvider, _settings: &crate::config::Settings) {}

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
                tx.send(item)
                    .await
                    .map_err(|_| MockTransportError)?;
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
        let mut transport = InterceptingTransport::new(mock_transport, emitter.clone(), logger.clone());

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
        assert_eq!(event.method, "callTool");
        assert_eq!(event.server_name.as_deref(), Some("srv"));
        assert_eq!(event.server_version.as_deref(), Some("1.2.3"));
        assert_eq!(event.server_protocol.as_deref(), Some("jsonrpc-2.0"));
        assert!(event.ok);
        assert!(event.response_json.is_some());
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
        let mut transport = InterceptingTransport::new(mock_transport, emitter.clone(), logger.clone());

        let message = transport.receive().await.expect("message");
        match message {
            JsonRpcMessage::Request(ref envelope) => {
                assert!(envelope
                    .request
                    .extensions()
                    .get::<RequestLogContext<BufferingEventEmitter, TestLogger>>()
                    .is_some());
            }
            _ => panic!("expected request"),
        }

        let init_result = mcp::InitializeResult {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder()
                .enable_logging()
                .build(),
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
        assert_eq!(event.client_name.as_deref(), Some("cli"));
        assert!(event.ok);
        assert!(event.response_json.is_some());

        let emitted = emitter.0.lock().unwrap().clone();
        assert!(emitted.iter().any(|(name, payload)| {
            name == EVENT_INCOMING_CLIENTS_UPDATED && payload["reason"] == "connect"
        }));

        incoming::clear_incoming().await;
    }
}
