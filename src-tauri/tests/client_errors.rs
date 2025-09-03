use mcp_bouncer::client::ensure_rmcp_client;
use mcp_bouncer::config::{MCPServerConfig, TransportType};

#[tokio::test]
async fn unsupported_transport_errors() {
    let cfg = MCPServerConfig{
        name: "x".into(),
        description: "d".into(),
        transport: None,
        command: String::new(),
        args: None,
        env: None,
        endpoint: None,
        headers: None,
        requires_auth: None,
        enabled: true,
    };
    let err = ensure_rmcp_client(&cfg.name, &cfg).await.err().unwrap();
    assert!(err.to_string().contains("unsupported"));
}

#[tokio::test]
async fn missing_command_for_stdio_errors() {
    let cfg = MCPServerConfig{
        name: "x".into(),
        description: "d".into(),
        transport: Some(TransportType::Stdio),
        command: String::new(),
        args: None,
        env: None,
        endpoint: None,
        headers: None,
        requires_auth: None,
        enabled: true,
    };
    let err = ensure_rmcp_client(&cfg.name, &cfg).await.err().unwrap();
    assert!(err.to_string().contains("missing command"));
}
