use mcp_bouncer::client::ensure_rmcp_client;
use mcp_bouncer::config::{MCPServerConfig, TransportType};

#[tokio::test]
async fn http_missing_endpoint_errors() {
    let cfg = MCPServerConfig {
        name: "x".into(),
        description: "d".into(),
        transport: TransportType::StreamableHttp,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: String::new(),
        headers: Default::default(),
        requires_auth: false,
        enabled: true,
    };
    let err = ensure_rmcp_client(&cfg.name, &cfg).await.err().unwrap();
    assert!(err.to_string().contains("no endpoint"));
}

#[tokio::test]
async fn missing_command_for_stdio_errors() {
    let cfg = MCPServerConfig {
        name: "x".into(),
        description: "d".into(),
        transport: TransportType::Stdio,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: String::new(),
        headers: Default::default(),
        requires_auth: false,
        enabled: true,
    };
    let err = ensure_rmcp_client(&cfg.name, &cfg).await.err().unwrap();
    assert!(err.to_string().contains("missing command"));
}
