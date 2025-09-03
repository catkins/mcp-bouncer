use mcp_bouncer::events::{EventEmitter, client_status_changed, servers_updated};

#[derive(Default)]
struct TestEmitter(std::sync::Mutex<Vec<(String, serde_json::Value)>>);

impl EventEmitter for TestEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        self.0
            .lock()
            .unwrap()
            .push((event.to_string(), payload.clone()));
    }
}

#[test]
fn event_sequence_for_auth_lifecycle() {
    let mock = TestEmitter::default();
    // Simulate a typical lifecycle: update -> requires_authorization -> authorizing -> connected
    servers_updated(&mock, "update");
    client_status_changed(&mock, "srv", "requires_authorization");
    client_status_changed(&mock, "srv", "authorizing");
    client_status_changed(&mock, "srv", "connected");

    let events = mock.0.lock().unwrap();
    assert_eq!(events.len(), 4);
    assert_eq!(
        events[0].0.as_str(),
        mcp_bouncer::events::EVENT_SERVERS_UPDATED
    );
    assert_eq!(
        events[1].0.as_str(),
        mcp_bouncer::events::EVENT_CLIENT_STATUS_CHANGED
    );
    assert_eq!(
        events[2].0.as_str(),
        mcp_bouncer::events::EVENT_CLIENT_STATUS_CHANGED
    );
    assert_eq!(
        events[3].0.as_str(),
        mcp_bouncer::events::EVENT_CLIENT_STATUS_CHANGED
    );
    assert_eq!(events[1].1["server_name"], "srv");
    assert_eq!(events[1].1["action"], "requires_authorization");
    assert_eq!(events[2].1["action"], "authorizing");
    assert_eq!(events[3].1["action"], "connected");
}
