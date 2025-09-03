use crate::config::{save_settings_with, ConfigProvider, Settings};
use crate::events::{settings_updated, servers_updated, EventEmitter};

pub fn update_settings<E: EventEmitter>(
    cp: &dyn ConfigProvider,
    emitter: &E,
    settings: Settings,
) -> Result<(), String> {
    save_settings_with(cp, &settings)?;
    settings_updated(emitter);
    Ok(())
}

// Emit a single consolidated server-change event. Intentionally does not emit
// incoming_clients_updated to avoid duplicate UI refreshes for server mutations.
pub fn notify_servers_changed<E: EventEmitter>(emitter: &E, reason: &str) {
    servers_updated(emitter, reason);
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{default_settings, settings_path};
    use crate::events::MockEventEmitter;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone)]
    struct TestProvider { base: PathBuf }
    impl crate::config::ConfigProvider for TestProvider { fn base_dir(&self) -> PathBuf { self.base.clone() } }
    impl TestProvider { fn new() -> Self { let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis(); let dir = std::env::temp_dir().join(format!("mcp-bouncer-logic-{}-{}", std::process::id(), stamp)); fs::create_dir_all(&dir).unwrap(); Self{ base: dir } } }

    #[test]
    fn update_settings_saves_and_emits() {
        let cp = TestProvider::new();
        let mock = MockEventEmitter::default();
        let s = default_settings();
        update_settings(&cp, &mock, s).unwrap();
        let p = settings_path(&cp);
        assert!(p.exists());
        let events = mock.0.lock().unwrap();
        assert_eq!(events.len(), 1);
    }

    #[test]
    fn notify_servers_changed_emits_once() {
        let mock = MockEventEmitter::default();
        super::notify_servers_changed(&mock, "add");
        let events = mock.0.lock().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, crate::events::EVENT_SERVERS_UPDATED);
    }
}
