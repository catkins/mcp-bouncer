use serde_json::json;

pub const EVENT_SERVERS_UPDATED: &str = "mcp:servers_updated";
pub const EVENT_SETTINGS_UPDATED: &str = "settings:updated";
pub const EVENT_CLIENT_STATUS_CHANGED: &str = "mcp:client_status_changed";
pub const EVENT_CLIENT_ERROR: &str = "mcp:client_error";
pub const EVENT_INCOMING_CLIENTS_UPDATED: &str = "mcp:incoming_clients_updated";
pub const EVENT_LOGS_RPC_EVENT: &str = "logs:rpc_event";

pub trait EventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value);
}

// A simple, threadsafe emitter for integration tests that want to assert
// event sequencing or payloads without Tauri. Stores events in a Vec.
#[derive(Default, Clone)]
pub struct BufferingEventEmitter(
    pub std::sync::Arc<std::sync::Mutex<Vec<(String, serde_json::Value)>>>,
);

impl EventEmitter for BufferingEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        self.0
            .lock()
            .unwrap()
            .push((event.to_string(), payload.clone()));
    }
}

// Helper functions to standardize payload shapes
pub fn servers_updated<E: EventEmitter>(emitter: &E, reason: &str) {
    emitter.emit(EVENT_SERVERS_UPDATED, &json!({ "reason": reason }));
}

pub fn incoming_clients_updated<E: EventEmitter>(emitter: &E, reason: &str) {
    emitter.emit(EVENT_INCOMING_CLIENTS_UPDATED, &json!({ "reason": reason }));
}

pub fn client_status_changed<E: EventEmitter>(emitter: &E, server_name: &str, action: &str) {
    emitter.emit(
        EVENT_CLIENT_STATUS_CHANGED,
        &json!({ "server_name": server_name, "action": action }),
    );
}

pub fn client_error<E: EventEmitter>(emitter: &E, server_name: &str, action: &str, error: &str) {
    emitter.emit(
        EVENT_CLIENT_ERROR,
        &json!({ "server_name": server_name, "action": action, "error": error }),
    );
}

pub fn settings_updated<E: EventEmitter>(emitter: &E) {
    emitter.emit(EVENT_SETTINGS_UPDATED, &json!({ "reason": "update" }));
}

// Logs: lightweight push of newly recorded RPC events.
// Payload mirrors a subset of crate::logging::Event after redaction.
pub fn logs_rpc_event<E: EventEmitter>(emitter: &E, evt: &crate::logging::Event) {
    emitter.emit(
        EVENT_LOGS_RPC_EVENT,
        &json!({
            "id": evt.id,
            "ts_ms": evt.ts_ms,
            "session_id": evt.session_id,
            "method": evt.method,
            "server_name": evt.server_name,
            "server_version": evt.server_version,
            "server_protocol": evt.server_protocol,
            "duration_ms": evt.duration_ms,
            "ok": evt.ok,
            "error": evt.error,
            "request_json": evt.request_json,
            "response_json": evt.response_json,
        }),
    );
}

#[cfg(test)]
pub struct MockEventEmitter(pub std::sync::Mutex<Vec<(String, serde_json::Value)>>);

#[cfg(test)]
impl Default for MockEventEmitter {
    fn default() -> Self {
        Self(std::sync::Mutex::new(vec![]))
    }
}

#[cfg(test)]
impl EventEmitter for MockEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        self.0
            .lock()
            .unwrap()
            .push((event.to_string(), payload.clone()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helper_payloads_are_emitted() {
        let mock = MockEventEmitter::default();
        servers_updated(&mock, "add");
        incoming_clients_updated(&mock, "servers_changed");
        client_status_changed(&mock, "srv", "enable");
        client_error(&mock, "srv", "enable", "oops");
        settings_updated(&mock);
        let events = mock.0.lock().unwrap();
        assert_eq!(events.len(), 5);
        assert_eq!(events[0].0, EVENT_SERVERS_UPDATED);
        assert_eq!(events[4].0, EVENT_SETTINGS_UPDATED);
    }
}
