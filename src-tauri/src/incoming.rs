use crate::config::IncomingClient;
use crate::runtime;

pub async fn record_connect(name: String, version: String, title: Option<String>) -> String {
    runtime::global()
        .incoming()
        .record_connect(name, version, title)
        .await
}

pub async fn list_incoming() -> Vec<IncomingClient> {
    runtime::global().incoming().list().await
}

#[cfg(test)]
pub async fn clear_incoming() {
    runtime::global().incoming().clear().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[tokio::test]
    #[serial_test::serial]
    async fn records_and_lists_clients() {
        // Avoid relying on global count; other tests may record concurrently.
        let original = crate::runtime::global();
        let provider = crate::runtime::ephemeral_config_provider("incoming");
        let state = Arc::new(crate::runtime::RuntimeState::new(provider));
        crate::runtime::set_global(state);
        let id1 = record_connect("client-a".into(), "1.0".into(), None).await;
        let id2 = record_connect("client-b".into(), "2.0".into(), Some("Title".into())).await;
        assert_ne!(id1, id2);
        let list = list_incoming().await;
        // Assert the specific records we created are present, by id and fields
        assert!(list.iter().any(|c| c.id == id1 && c.name == "client-a"));
        assert!(
            list.iter().any(|c| c.id == id2
                && c.name == "client-b"
                && c.title.as_deref() == Some("Title"))
        );
        crate::runtime::set_global(original);
    }
}
