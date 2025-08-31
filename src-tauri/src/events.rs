use tauri::Emitter;
use serde_json::json;

pub const EVENT_SERVERS_UPDATED: &str = "mcp:servers_updated";
pub const EVENT_SETTINGS_UPDATED: &str = "settings:updated";
pub const EVENT_CLIENT_STATUS_CHANGED: &str = "mcp:client_status_changed";
pub const EVENT_CLIENT_ERROR: &str = "mcp:client_error";
pub const EVENT_INCOMING_CLIENTS_UPDATED: &str = "mcp:incoming_clients_updated";

pub trait EventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value);
}

pub struct TauriEventEmitter(pub tauri::AppHandle);

impl EventEmitter for TauriEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        let _ = self.0.emit(event, payload);
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

#[cfg(test)]
pub struct MockEventEmitter(pub std::sync::Mutex<Vec<(String, serde_json::Value)>>);

#[cfg(test)]
impl Default for MockEventEmitter { fn default() -> Self { Self(std::sync::Mutex::new(vec![])) } }

#[cfg(test)]
impl EventEmitter for MockEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        self.0.lock().unwrap().push((event.to_string(), payload.clone()));
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
