use mcp_bouncer::config::{
    ConfigProvider, MCPServerConfig, TransportType, default_settings, save_settings_with,
};
use mcp_bouncer::{events::EventEmitter, server::start_http_server};
use rmcp::ServiceExt;
use rmcp::model as mcp;
use rmcp::transport::StreamableHttpClientTransport;
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

// This test requires Node/npm and network access to install @modelcontextprotocol/server-everything.
#[tokio::test]
async fn e2e_list_and_echo_with_everything_server() {
    // // Opt-in gate to avoid accidental network/process usage on CI without Node/npm
    // if std::env::var("E2E_ALLOW_NETWORK").ok().as_deref() != Some("1") {
    //     eprintln!("Skipping e2e_everything: set E2E_ALLOW_NETWORK=1 to run");
    //     return;
    // }
    // Require npx to be available
    assert!(
        std::process::Command::new("npx")
            .arg("--version")
            .status()
            .ok()
            .filter(|s| s.success())
            .is_some(),
        "npx must be installed and available on PATH"
    );
    // Write settings with a single stdio server using npx @modelcontextprotocol/server-everything
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "everything".into(),
        description: "test".into(),
        transport: Some(TransportType::TransportStdio),
        command: "npx".into(),
        args: Some(vec![
            "-y".into(),
            "@modelcontextprotocol/server-everything".into(),
        ]),
        env: None,
        endpoint: None,
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
    let echo_name = "everything::echo";
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
        "echo response should contain 'hello' but was: {}",
        text
    );
}
