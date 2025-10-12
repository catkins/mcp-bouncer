use std::sync::Arc;

use mcp_bouncer::incoming::{list_incoming, record_connect};
use mcp_bouncer::runtime;

#[tokio::test]
#[serial_test::serial]
async fn recorded_clients_are_listed() {
    let original = runtime::global();
    let provider = runtime::ephemeral_config_provider("incoming-test");
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
