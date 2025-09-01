use crate::config::{
    load_clients_state_with,
    load_settings_with,
    save_clients_state_with,
    save_settings_with,
    ConfigProvider,
    Settings,
};
use crate::events::{client_status_changed, settings_updated, EventEmitter};
use crate::client::remove_rmcp_client;
use std::collections::HashMap;

pub fn update_settings<E: EventEmitter>(
    cp: &dyn ConfigProvider,
    emitter: &E,
    settings: Settings,
) -> Result<(), String> {
    save_settings_with(cp, &settings)?;
    settings_updated(emitter);
    Ok(())
}

pub async fn authorize_client<E: EventEmitter>(
    cp: &dyn ConfigProvider,
    emitter: &E,
    name: &str,
    token: &str,
) -> Result<(), String> {
    let mut s = load_settings_with(cp);
    let srv = s
        .mcp_servers
        .iter_mut()
        .find(|c| c.name == name)
        .ok_or_else(|| "server not found".to_string())?;
    let headers = srv.headers.get_or_insert_with(HashMap::new);
    headers.insert("Authorization".into(), format!("Bearer {}", token));
    save_settings_with(cp, &s)?;

    let mut st = load_clients_state_with(cp);
    let entry = st.0.entry(name.to_string()).or_default();
    entry.oauth_authenticated = Some(true);
    entry.authorization_required = Some(false);
    save_clients_state_with(cp, &st)?;

    remove_rmcp_client(name).await?;
    client_status_changed(emitter, name, "authorize");
    Ok(())
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
}

