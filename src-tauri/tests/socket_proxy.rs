#![cfg(unix)]

use std::{path::PathBuf, sync::Arc, time::Duration};

use mcp_bouncer::{
    config::{ConfigProvider, Settings},
    events::BufferingEventEmitter,
    logging::{Event, RpcEventPublisher},
    server::{self, stop_server},
    socket_proxy,
};
use rmcp::ServiceExt;

#[derive(Clone)]
struct TestProvider {
    base: Arc<PathBuf>,
}

impl TestProvider {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("mbsp-{}-{}", std::process::id(), stamp));
        std::fs::create_dir_all(&path).unwrap();
        Self {
            base: Arc::new(path),
        }
    }
}

impl ConfigProvider for TestProvider {
    fn base_dir(&self) -> PathBuf {
        self.base.as_ref().clone()
    }
}

#[derive(Clone, Default)]
struct NoopLogger;

impl RpcEventPublisher for NoopLogger {
    fn init_with(&self, _cp: &dyn ConfigProvider, _settings: &Settings) {}

    fn log(&self, _event: Event) {}

    fn log_and_emit<E: mcp_bouncer::events::EventEmitter>(&self, _emitter: &E, _event: Event) {}
}

#[tokio::test]
async fn unix_proxy_bridges_requests() {
    let cp = TestProvider::new();
    let emitter = BufferingEventEmitter::default();
    let logger = NoopLogger::default();
    let socket_path = cp.base_dir().join("bouncer.sock");

    let (server_handle, _bound) = server::start_server(
        emitter,
        cp.clone(),
        logger,
        mcp_bouncer::config::ServerTransport::Unix,
        socket_path.to_string_lossy().to_string(),
    )
    .await
    .expect("start unix server");

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let (client_stream, proxy_stream) = tokio::io::duplex(8192);

    let proxy_task = tokio::spawn({
        let socket_path = socket_path.clone();
        async move {
            socket_proxy::serve_stdio(proxy_stream, socket_path, "/mcp", async {
                let _ = shutdown_rx.await;
            })
            .await
        }
    });

    // Wait briefly for proxy to start
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = ().serve(client_stream).await.expect("construct client");

    // Listing tools should succeed (empty result ok)
    client
        .list_all_tools()
        .await
        .expect("list tools over proxy");

    let _ = shutdown_tx.send(());
    proxy_task
        .await
        .expect("proxy task join")
        .expect("proxy serve");

    stop_server(&server_handle);
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert!(server_handle.is_finished());
}
