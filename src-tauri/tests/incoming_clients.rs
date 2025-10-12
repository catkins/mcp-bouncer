use std::{
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use mcp_bouncer::config::ConfigProvider;
use mcp_bouncer::incoming::{list_incoming, record_connect};
use mcp_bouncer::runtime;

#[derive(Clone)]
struct TempProvider(PathBuf);

impl TempProvider {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!(
            "mcp-bouncer-incoming-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
}

impl ConfigProvider for TempProvider {
    fn base_dir(&self) -> PathBuf {
        self.0.clone()
    }
}

#[tokio::test]
#[serial_test::serial]
async fn recorded_clients_are_listed() {
    let original = runtime::global();
    let provider = Arc::new(TempProvider::new());
    let state = Arc::new(mcp_bouncer::runtime::RuntimeState::new(provider));
    runtime::set_global(state);
    // Start with a clean slate by recording distinct IDs
    let _ = record_connect("tester-a".into(), "0.1".into(), None).await;
    let _ = record_connect("tester-b".into(), "0.2".into(), Some("Unit".into())).await;
    let list = list_incoming().await;
    // At least 2 entries present and includes our names
    assert!(list.len() >= 2);
    assert!(list.iter().any(|c| c.name == "tester-a"));
    assert!(
        list.iter()
            .any(|c| c.name == "tester-b" && c.title.as_deref() == Some("Unit"))
    );
    runtime::set_global(original);
}
