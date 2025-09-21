use std::collections::HashMap;

use mcp_bouncer::client::ensure_rmcp_client;
use mcp_bouncer::config::{MCPServerConfig, TransportType};
use mcp_bouncer::events::BufferingEventEmitter;
use mcp_bouncer::logging::RpcEventPublisher;
use rmcp::model as mcp;

#[derive(Clone)]
struct TestSseService;

impl rmcp::handler::server::ServerHandler for TestSseService {
    fn get_info(&self) -> mcp::ServerInfo {
        mcp::ServerInfo {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder()
                .enable_tools()
                .enable_tool_list_changed()
                .build(),
            server_info: mcp::Implementation {
                name: "sse-test".into(),
                title: None,
                version: "0.0.1".into(),
                icons: None,
                website_url: None,
            },
            instructions: None,
        }
    }

    fn list_tools(
        &self,
        _request: Option<mcp::PaginatedRequestParam>,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> impl core::future::Future<Output = Result<mcp::ListToolsResult, mcp::ErrorData>> + Send + '_
    {
        let schema: mcp::JsonObject = Default::default();
        std::future::ready(Ok(mcp::ListToolsResult {
            tools: vec![mcp::Tool::new("echo", "echo", schema)],
            next_cursor: None,
        }))
    }

    fn call_tool(
        &self,
        _request: mcp::CallToolRequestParam,
        context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> impl core::future::Future<Output = Result<mcp::CallToolResult, mcp::ErrorData>> + Send + '_
    {
        let mut observed = String::new();
        if let Some(parts) = context.extensions.get::<axum::http::request::Parts>()
            && let Some(v) = parts.headers.get("x-test").and_then(|v| v.to_str().ok())
        {
            observed = v.to_string();
        }
        let text = if observed.is_empty() {
            "no-header".to_string()
        } else {
            format!("x-test:{observed}")
        };
        std::future::ready(Ok(mcp::CallToolResult {
            content: vec![mcp::Content::text(text)],
            structured_content: None,
            is_error: None,
            meta: None,
        }))
    }
}

#[derive(Clone, Default)]
struct NoopLogger;

impl RpcEventPublisher for NoopLogger {
    fn init_with(
        &self,
        _cp: &dyn mcp_bouncer::config::ConfigProvider,
        _settings: &mcp_bouncer::config::Settings,
    ) {
    }

    fn log(&self, _event: mcp_bouncer::logging::Event) {}

    fn log_and_emit<E: mcp_bouncer::events::EventEmitter>(
        &self,
        _emitter: &E,
        _event: mcp_bouncer::logging::Event,
    ) {
    }
}

#[tokio::test]
async fn sse_client_can_connect_list_tools_and_send_headers() {
    // Start SSE server on ephemeral port
    // Pick an available port by probing, then start server on that port
    let test_name = "sse_client_can_connect_list_tools_and_send_headers";
    let probe = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping {test_name}: {err}");
            return;
        }
        Err(err) => panic!("failed to bind sse probe listener: {err}"),
    };
    let addr = probe.local_addr().unwrap();
    drop(probe);
    let server = match rmcp::transport::SseServer::serve(addr).await {
        Ok(s) => s,
        Err(err) => {
            if err.to_string().contains("Operation not permitted") {
                eprintln!("skipping {test_name}: {err}");
                return;
            }
            panic!("start sse server failed: {err}");
        }
    };
    let _ct = server.with_service(|| TestSseService);

    // Configure SSE client with custom headers
    let mut headers = HashMap::new();
    headers.insert("x-test".to_string(), "yes".to_string());
    let cfg = MCPServerConfig {
        name: "sse-upstream".into(),
        description: "test".into(),
        transport: TransportType::Sse,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: format!("http://{}:{}/sse", addr.ip(), addr.port()),
        headers,
        requires_auth: false,
        enabled: true,
    };

    let emitter = BufferingEventEmitter::default();
    let logger = NoopLogger::default();

    let client = ensure_rmcp_client(&cfg.name, &cfg, &emitter, &logger)
        .await
        .expect("ensure sse client");
    // list tools
    let tools = client.list_all_tools().await.expect("list tools");
    let names: Vec<_> = tools.into_iter().map(|t| t.name.to_string()).collect();
    assert!(names.contains(&"echo".to_string()));

    // call a tool and verify header observed by server
    let res = client
        .call_tool(mcp::CallToolRequestParam {
            name: "echo".into(),
            arguments: None,
        })
        .await
        .expect("call echo");
    let text = res
        .content
        .iter()
        .filter_map(|c| c.as_text().map(|t| t.text.clone()))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        text.contains("x-test:yes"),
        "expected header value, got: {text}"
    );
}
