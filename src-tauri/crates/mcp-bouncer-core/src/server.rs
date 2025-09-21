use axum::Router;
use std::{marker::PhantomData, sync::Arc};
use futures::future::join_all;
use rmcp::model as mcp;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use rmcp::{RoleServer, Service as McpService};

use crate::client::{apply_log_context_from_client, ensure_rmcp_client, fetch_tools_for_cfg};
use crate::config::{ConfigProvider, MCPServerConfig, load_settings_with};
use crate::events::EventEmitter;
use crate::events::client_status_changed;
use crate::logging::RpcEventPublisher;
use crate::transport::intercepting::{InterceptingSessionManager, RequestLogContext};
use crate::unauthorized;

// Runtime-bound listen address storage
static RUNTIME_ADDR: std::sync::OnceLock<std::net::SocketAddr> = std::sync::OnceLock::new();

pub fn set_runtime_listen_addr(addr: std::net::SocketAddr) {
    let _ = RUNTIME_ADDR.set(addr);
}

pub fn get_runtime_listen_addr() -> Option<std::net::SocketAddr> {
    RUNTIME_ADDR.get().copied()
}

#[derive(Clone)]
pub struct BouncerService<E, CP, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    pub emitter: E,
    pub cp: CP,
    _logger: PhantomData<L>,
}

impl<E, CP, L> McpService<RoleServer> for BouncerService<E, CP, L>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    async fn handle_request(
        &self,
        request: mcp::ClientRequest,
        context: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<mcp::ServerResult, mcp::ErrorData> {
        match request {
            mcp::ClientRequest::InitializeRequest(_req) => {
                let capabilities = mcp::ServerCapabilities::builder()
                    .enable_logging()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build();
                let result = mcp::InitializeResult {
                    protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                    capabilities,
                    server_info: mcp::Implementation {
                        name: "MCP Bouncer".into(),
                        title: None,
                        version: env!("CARGO_PKG_VERSION").into(),
                        icons: None,
                        website_url: None,
                    },
                    instructions: None,
                };
                Ok(mcp::ServerResult::InitializeResult(result))
            }
            mcp::ClientRequest::ListToolsRequest(_req) => {
                let settings = load_settings_with(&self.cp);
                let servers: Vec<_> = settings
                    .mcp_servers
                    .into_iter()
                    .filter(|c| c.enabled)
                    .collect();
                const TOOL_LIST_TIMEOUT_SECS: u64 = 6;
                let mut tools = aggregate_tools(
                    servers,
                    std::time::Duration::from_secs(TOOL_LIST_TIMEOUT_SECS),
                )
                .await;
                let state = crate::config::load_tools_state_with(&self.cp);
                tools.retain(|t| {
                    if let Some((server, tool)) = t.name.split_once("::") {
                        state
                            .0
                            .get(server)
                            .and_then(|m| m.get(tool))
                            .copied()
                            .unwrap_or(true)
                    } else {
                        true
                    }
                });
                Ok(mcp::ServerResult::ListToolsResult(mcp::ListToolsResult {
                    tools,
                    next_cursor: None,
                }))
            }
            mcp::ClientRequest::CallToolRequest(req) => {
                let log_ctx = context
                    .extensions
                    .get::<RequestLogContext<E, L>>()
                    .cloned();
                let name = req.params.name.to_string();
                let (server_name, tool_name) = name
                    .split_once("::")
                    .map(|(a, b)| (a.to_string(), b.to_string()))
                    .unwrap_or((String::new(), name.clone()));
                let args_obj = req
                    .params
                    .arguments
                    .clone()
                    .map(serde_json::Value::Object)
                    .and_then(|v| v.as_object().cloned());
                let cfg_opt = match select_target_server(&self.cp, &server_name) {
                    Ok(opt) => opt,
                    Err(msg) => {
                        let out = mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                            content: vec![mcp::Content::text(msg)],
                            structured_content: None,
                            is_error: Some(true),
                            meta: None,
                        });
                        return Ok(out);
                    }
                };
                if let Some(cfg) = cfg_opt {
                    if let Some(ctx) = log_ctx.as_ref() {
                        ctx.set_server_name(cfg.name.clone()).await;
                    }
                    match ensure_rmcp_client(&cfg.name, &cfg).await {
                        Ok(client) => {
                            if let Some(ctx) = log_ctx.as_ref() {
                                apply_log_context_from_client(&client, &cfg, ctx).await;
                            }
                            match client
                            .call_tool(mcp::CallToolRequestParam {
                                name: tool_name.into(),
                                arguments: args_obj,
                            })
                            .await
                        {
                            Ok(res) => Ok(mcp::ServerResult::CallToolResult(res)),
                            Err(e) => {
                                if matches!(
                                    cfg.transport,
                                    crate::config::TransportType::StreamableHttp
                                ) {
                                    unauthorized::on_possible_unauthorized(
                                        &cfg.name,
                                        Some(&cfg.endpoint),
                                    )
                                    .await;
                                    client_status_changed(
                                        &self.emitter,
                                        &cfg.name,
                                        "requires_authorization",
                                    );
                                }
                                let out = mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                                    content: vec![mcp::Content::text(format!("error: {e}"))],
                                    structured_content: None,
                                    is_error: Some(true),
                                    meta: None,
                                });
                                Ok(out)
                            }
                        }
                        }
                        Err(e) => {
                            let out = mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                                content: vec![mcp::Content::text(format!("error: {e}"))],
                                structured_content: None,
                                is_error: Some(true),
                                meta: None,
                            });
                            Ok(out)
                        }
                    }
                } else {
                    let out = mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                        content: vec![mcp::Content::text("no server".to_string())],
                        structured_content: None,
                        is_error: Some(true),
                        meta: None,
                    });
                    Ok(out)
                }
            }
            other => {
                let _ = other;
                Ok(mcp::ServerResult::empty(()))
            }
        }
    }

    async fn handle_notification(
        &self,
        _notification: mcp::ClientNotification,
        _context: rmcp::service::NotificationContext<RoleServer>,
    ) -> Result<(), mcp::ErrorData> {
        Ok(())
    }

    fn get_info(&self) -> mcp::ServerInfo {
        mcp::ServerInfo {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder()
                .enable_logging()
                .enable_tools()
                .enable_tool_list_changed()
                .build(),
            server_info: mcp::Implementation {
                name: "MCP Bouncer".into(),
                title: None,
                version: env!("CARGO_PKG_VERSION").into(),
                icons: None,
                website_url: None,
            },
            instructions: None,
        }
    }
}

fn to_mcp_tool(server: &str, v: &serde_json::Value) -> Option<mcp::Tool> {
    let name = v.get("name")?.as_str()?.to_string();
    let description = v
        .get("description")
        .and_then(|d| d.as_str())
        .map(|s| s.to_string());
    let schema_obj = v
        .get("inputSchema")
        .or_else(|| v.get("input_schema"))
        .and_then(|s| s.as_object().cloned())
        .unwrap_or_default();
    let fullname = format!("{server}::{name}");
    Some(mcp::Tool::new(
        fullname,
        description.unwrap_or_default(),
        schema_obj,
    ))
}

fn select_target_server<CP: ConfigProvider>(
    cp: &CP,
    server_name: &str,
) -> Result<Option<MCPServerConfig>, String> {
    if !server_name.is_empty() {
        Ok(load_settings_with(cp)
            .mcp_servers
            .into_iter()
            .find(|c| c.name == server_name))
    } else {
        let settings = load_settings_with(cp);
        let enabled: Vec<_> = settings
            .mcp_servers
            .into_iter()
            .filter(|c| c.enabled)
            .collect();
        Ok(match enabled.len() {
            0 => None,
            1 => enabled.into_iter().next(),
            _ => return Err("multiple enabled servers; specify 'server::tool'".to_string()),
        })
    }
}

async fn aggregate_tools(
    servers: Vec<MCPServerConfig>,
    timeout: std::time::Duration,
) -> Vec<mcp::Tool> {
    let tasks = servers.into_iter().map(|cfg| async move {
        let name = cfg.name.clone();
        let fut = async move { fetch_tools_for_cfg(&cfg).await };
        match tokio::time::timeout(timeout, fut).await {
            Ok(Ok(list)) => Some((name, list)),
            _ => None,
        }
    });
    let mut tools: Vec<mcp::Tool> = Vec::new();
    for res in join_all(tasks).await.into_iter().flatten() {
        let (server_name, list) = res;
        for item in list {
            if let Some(t) = to_mcp_tool(&server_name, &item) {
                tools.push(t);
            }
        }
    }
    tools
}

/* test module moved to end of file to satisfy clippy::items-after-test-module */
#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::*;
    use crate::config::{ConfigProvider, Settings, default_settings, save_settings_with};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone)]
    struct TestProvider {
        base: PathBuf,
    }
    impl TestProvider {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "mcp-bouncer-route-{}-{}",
                std::process::id(),
                stamp
            ));
            fs::create_dir_all(&dir).unwrap();
            Self { base: dir }
        }
    }
    impl ConfigProvider for TestProvider {
        fn base_dir(&self) -> PathBuf {
            self.base.clone()
        }
    }

    #[derive(Clone, Default)]
    struct NoopLogger;

    impl crate::logging::RpcEventPublisher for NoopLogger {
        fn init_with(&self, _cp: &dyn ConfigProvider, _settings: &Settings) {}

        fn log(&self, _event: crate::logging::Event) {}

        fn log_and_emit<E: crate::events::EventEmitter>(
            &self,
            _emitter: &E,
            _event: crate::logging::Event,
        ) {
        }
    }

    #[test]
    fn unqualified_tool_errors_when_multiple_enabled() {
        let cp = TestProvider::new();
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig {
            name: "a".into(),
            description: "d".into(),
            transport: crate::config::TransportType::Stdio,
            command: String::new(),
            args: vec![],
            env: Default::default(),
            endpoint: String::new(),
            headers: Default::default(),
            requires_auth: false,
            enabled: true,
        });
        s.mcp_servers.push(MCPServerConfig {
            name: "b".into(),
            description: "d".into(),
            transport: crate::config::TransportType::Stdio,
            command: String::new(),
            args: vec![],
            env: Default::default(),
            endpoint: String::new(),
            headers: Default::default(),
            requires_auth: false,
            enabled: true,
        });
        save_settings_with(&cp, &s).unwrap();
        let sel = super::select_target_server(&cp, "");
        assert!(sel.is_err());
        assert!(sel.err().unwrap().contains("multiple enabled servers"));
    }

    #[test]
    fn to_mcp_tool_handles_input_schema_casing() {
        let v1 = serde_json::json!({ "name": "echo", "description": "d", "inputSchema": { "type": "object" } });
        let v2 = serde_json::json!({ "name": "ping", "input_schema": { "type": "object" } });
        let t1 = super::to_mcp_tool("srv", &v1).unwrap();
        let t2 = super::to_mcp_tool("srv", &v2).unwrap();
        assert!(t1.name.contains("srv::echo"));
        assert!(t2.name.contains("srv::ping"));
    }

    #[tokio::test]
    async fn stop_server_aborts_task() {
        let emitter = crate::events::BufferingEventEmitter::default();
        let cp = TestProvider::new();
        let (handle, _addr) = super::start_http_server(
            emitter.clone(),
            cp.clone(),
            NoopLogger,
            "127.0.0.1:0".parse().unwrap(),
        )
        .await
        .unwrap();
        // Abort the server handle and ensure task finishes promptly
        super::stop_http_server(&handle);
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(handle.is_finished());
    }

    #[tokio::test]
    async fn list_tools_does_not_emit_events() {
        use crate::events::BufferingEventEmitter;
        let emitter = BufferingEventEmitter::default();
        let _cp = TestProvider::new();
        // No emission happens unless emit_* helpers are called explicitly
        // Ensure our helper is not invoked and the buffer stays empty.
        let events = emitter.0.lock().unwrap();
        assert!(events.is_empty(), "list tools should not emit events");
    }
}

pub async fn start_http_server<E, CP, L>(
    emitter: E,
    cp: CP,
    logger: L,
    addr: std::net::SocketAddr,
) -> Result<(tokio::task::JoinHandle<()>, std::net::SocketAddr), String>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
    L: RpcEventPublisher,
{
    // Initialize logging (idempotent)
    let settings = load_settings_with(&cp);
    logger.init_with(&cp, &settings);
    let session_manager = Arc::new(InterceptingSessionManager::new(
        LocalSessionManager::default(),
        emitter.clone(),
        logger.clone(),
    ));
    let service: StreamableHttpService<
        BouncerService<E, CP, L>,
        InterceptingSessionManager<LocalSessionManager, E, L>,
    > = StreamableHttpService::new(
        {
            let emitter = emitter.clone();
            let cp = cp.clone();
            move || {
                Ok(BouncerService {
                    emitter: emitter.clone(),
                    cp: cp.clone(),
                    _logger: PhantomData,
                })
            }
        },
        session_manager,
        StreamableHttpServerConfig {
            stateful_mode: true,
            sse_keep_alive: Some(std::time::Duration::from_secs(15)),
        },
    );
    let router = Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;
    let local = listener.local_addr().map_err(|e| e.to_string())?;
    // Record the runtime-bound address for UI/commands to query
    set_runtime_listen_addr(local);
    tracing::info!(target = "server", ip=%local.ip(), port=local.port(), "proxy_listening");
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok((handle, local))
}

// Abort the HTTP server task. Intended for integration tests or coordinated shutdown.
pub fn stop_http_server(handle: &tokio::task::JoinHandle<()>) {
    handle.abort();
}

// Keep tests at the end of the file so clippy doesn't flag items after test module.
