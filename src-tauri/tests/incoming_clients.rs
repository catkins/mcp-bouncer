use mcp_bouncer::incoming::{list_incoming, record_connect};

#[tokio::test]
async fn recorded_clients_are_listed() {
    // Start with a clean slate by recording distinct IDs
    let _ = record_connect("tester-a".into(), "0.1".into(), None).await;
    let _ = record_connect("tester-b".into(), "0.2".into(), Some("Unit".into())).await;
    let list = list_incoming().await;
    // At least 2 entries present and includes our names
    assert!(list.len() >= 2);
    assert!(list.iter().any(|c| c.name == "tester-a"));
    assert!(list.iter().any(|c| c.name == "tester-b" && c.title.as_deref() == Some("Unit")));
}

