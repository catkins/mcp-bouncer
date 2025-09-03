use mcp_bouncer::config::{
    ConfigProvider, MCPServerConfig, TransportType, default_settings, save_settings_with,
};
use mcp_bouncer::{events::EventEmitter, server::start_http_server};
use rmcp::ServiceExt;
use rmcp::model as mcp;
use rmcp::transport::{StreamableHttpClientTransport, streamable_http_server::{StreamableHttpService, StreamableHttpServerConfig, session::local::LocalSessionManager}};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

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
        let dir =
            std::env::temp_dir().join(format!("mcp-bouncer-e2e-{}-{}", std::process::id(), stamp));
        fs::create_dir_all(&dir).unwrap();
        Self { base: dir }
    }
}

impl ConfigProvider for TempConfigProvider {
    fn base_dir(&self) -> PathBuf {
        self.base.clone()
    }
}

#[tokio::test]
async fn e2e_list_and_echo_hermetic_http() {
// Start an in-process upstream HTTP MCP server exposing an echo tool
    #[derive(Clone)]
    struct Upstream;
    impl rmcp::handler::server::ServerHandler for Upstream {
        fn get_info(&self) -> mcp::ServerInfo {
            mcp::ServerInfo {
                protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                capabilities: mcp::ServerCapabilities::builder().enable_tools().enable_tool_list_changed().build(),
                server_info: mcp::Implementation { name: "up".into(), version: "0.0.1".into() },
                instructions: None,
            }
        }
        fn list_tools(
            &self,
            _request: Option<mcp::PaginatedRequestParam>,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::ListToolsResult, mcp::ErrorData>> + Send + '_ {
            let schema: mcp::JsonObject = Default::default();
            std::future::ready(Ok(mcp::ListToolsResult { tools: vec![mcp::Tool::new("echo", "echo", schema)], next_cursor: None }))
        }
        fn call_tool(
            &self,
            request: mcp::CallToolRequestParam,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::CallToolResult, mcp::ErrorData>> + Send + '_ {
            let msg = request.arguments.and_then(|m| m.get("message").and_then(|v| v.as_str()).map(|s| s.to_string())).unwrap_or_default();
            std::future::ready(Ok(mcp::CallToolResult { content: vec![mcp::Content::text(msg)], structured_content: None, is_error: None }))
        }
    }

    let upstream_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_addr = upstream_listener.local_addr().unwrap();
    let upstream_service: StreamableHttpService<Upstream, LocalSessionManager> = StreamableHttpService::new(
        || Ok(Upstream),
        Default::default(),
        StreamableHttpServerConfig { stateful_mode: true, sse_keep_alive: Some(std::time::Duration::from_secs(15)) },
    );
    let upstream_router = axum::Router::new().nest_service("/mcp", upstream_service);
    tokio::spawn(async move { let _ = axum::serve(upstream_listener, upstream_router).await; });

    // Write settings with a single HTTP upstream
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "up".into(),
        description: "test".into(),
        transport: Some(TransportType::StreamableHttp),
        command: String::new(),
        args: None,
        env: None,
        endpoint: Some(format!("http://{}:{}/mcp", upstream_addr.ip(), upstream_addr.port())),
        headers: None,
        requires_auth: Some(false),
        enabled: true,
    });
    save_settings_with(&cp, &s).expect("save settings");

    // Start bouncer HTTP server on an ephemeral port
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 0));
    #[derive(Clone)]
    struct NoopEmitter;
    impl EventEmitter for NoopEmitter {
        fn emit(&self, _e: &str, _p: &serde_json::Value) {}
    }
    let (_handle, bound) = start_http_server(NoopEmitter, cp.clone(), addr)
        .await
        .expect("start http server");
    let url = format!("http://{}:{}/mcp", bound.ip(), bound.port());

    // Connect an MCP client to the bouncer
    let transport = StreamableHttpClientTransport::from_uri(url);
    let client = ().serve(transport).await.expect("serve client");

    // List tools; expect everything::echo present (retry while upstream boots)
    let echo_name = "up::echo";
    let start = std::time::Instant::now();
    let _names = loop {
        let tools = client.list_all_tools().await.expect("list tools");
        let names: Vec<String> = tools.into_iter().map(|t| t.name.to_string()).collect();
        if names.iter().any(|n| n == echo_name) {
            break names;
        }
        if start.elapsed() > std::time::Duration::from_secs(45) {
            panic!("tools did not include {echo_name} within timeout; got: {names:?}");
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    };

    // Call echo tool
    let res = client
        .call_tool(mcp::CallToolRequestParam {
            name: "echo".into(),
            arguments: Some(
                serde_json::json!({ "message": "hello" })
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
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
        text.contains("hello"),
        "echo response should contain 'hello' but was: {text}",
    );
}
