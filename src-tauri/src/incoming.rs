use std::sync::{atomic::{AtomicU64, Ordering}, OnceLock};

use crate::config::IncomingClient;

// In-memory registry of incoming clients (Initialize’d connections)
pub type IncomingRegistry = tokio::sync::Mutex<Vec<IncomingClient>>;

static INCOMING_REGISTRY: OnceLock<IncomingRegistry> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub fn incoming_registry() -> &'static IncomingRegistry {
    INCOMING_REGISTRY.get_or_init(|| tokio::sync::Mutex::new(Vec::new()))
}

pub async fn record_connect(name: String, version: String, title: Option<String>) -> String {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let id_str = format!("{}-{}", std::process::id(), id);
    let client = IncomingClient {
        id: id_str.clone(),
        name,
        version,
        title,
        connected_at: Some(iso8601_now()),
    };
    let reg = incoming_registry();
    let mut guard = reg.lock().await;
    guard.push(client);
    id_str
}

pub async fn list_incoming() -> Vec<IncomingClient> {
    let reg = incoming_registry();
    let guard = reg.lock().await;
    guard.clone()
}

#[cfg(test)]
pub async fn clear_incoming() {
    let reg = incoming_registry();
    let mut guard = reg.lock().await;
    guard.clear();
}

fn iso8601_now() -> String {
    // RFC3339 / ISO8601 UTC timestamp suitable for JS Date parsing
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn records_and_lists_clients() {
        clear_incoming().await;
        let id1 = record_connect("client-a".into(), "1.0".into(), None).await;
        let id2 = record_connect("client-b".into(), "2.0".into(), Some("Title".into())).await;
        assert_ne!(id1, id2);
        let list = list_incoming().await;
        assert_eq!(list.len(), 2);
        assert!(list.iter().any(|c| c.name == "client-a"));
        assert!(list.iter().any(|c| c.name == "client-b" && c.title.as_deref() == Some("Title")));
    }
}
