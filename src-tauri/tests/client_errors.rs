use mcp_bouncer::client::ensure_rmcp_client;
use mcp_bouncer::events::BufferingEventEmitter;
use mcp_bouncer::logging::RpcEventPublisher;

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
    let emitter = BufferingEventEmitter::default();
    let logger = NoopLogger::default();
    let err = ensure_rmcp_client(&cfg.name, &cfg, &emitter, &logger)
        .await
        .err()
        .unwrap();
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
    let emitter = BufferingEventEmitter::default();
    let logger = NoopLogger::default();
    let err = ensure_rmcp_client(&cfg.name, &cfg, &emitter, &logger)
        .await
        .err()
        .unwrap();
    assert!(err.to_string().contains("missing command"));
}
