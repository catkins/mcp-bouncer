use std::collections::HashMap;

use crate::config::{
    ClientConnectionState, ClientStatus, ConfigProvider, OsConfigProvider, load_settings_with,
};
use crate::overlay;

pub async fn compute_client_status_map_with(
    cp: &dyn ConfigProvider,
) -> HashMap<String, ClientStatus> {
    let settings = load_settings_with(cp);
    let mut map: HashMap<String, ClientStatus> = HashMap::new();
    for server in settings.mcp_servers {
        let name = server.name.clone();
        map.insert(
            name.clone(),
            ClientStatus {
                name: name.clone(),
                state: ClientConnectionState::Disconnected,
                tools: 0,
                last_error: None,
                authorization_required: false,
                oauth_authenticated: false,
            },
        );
    }
    let overlay = overlay::snapshot().await;
    for (name, entry) in overlay.into_iter() {
        if let Some(cs) = map.get_mut(&name) {
            cs.state = entry.state;
            cs.last_error = entry.last_error;
            cs.authorization_required = entry.authorization_required;
            cs.oauth_authenticated = entry.oauth_authenticated;
            cs.tools = entry.tools;
        }
    }
    map
}

pub async fn compute_client_status_map() -> HashMap<String, ClientStatus> {
    compute_client_status_map_with(&OsConfigProvider).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{
        ClientConnectionState, ConfigProvider, MCPServerConfig, TransportType, default_settings,
        save_settings_with,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone)]
    struct TestProvider {
        base: PathBuf,
    }

    impl TestProvider {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let tid = format!("{:?}", std::thread::current().id());
            let dir = std::env::temp_dir().join(format!(
                "mcp-bouncer-status-{}-{}-{}",
                std::process::id(),
                tid,
                stamp
            ));
            fs::create_dir_all(&dir).unwrap();
            Self { base: dir }
        }
    }

    impl ConfigProvider for TestProvider {
        fn base_dir(&self) -> PathBuf {
            self.base.clone()
        }
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn tools_count_and_connected_logic() {
        crate::overlay::clear_all().await;
        let cp = TestProvider::new();
        // settings with one enabled HTTP server
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig {
            name: "srv1".into(),
            description: "d".into(),
            transport: TransportType::StreamableHttp,
            command: String::new(),
            args: vec![],
            env: Default::default(),
            endpoint: "http://127.0.0.1".into(),
            headers: Default::default(),
            enabled: true,
        });
        save_settings_with(&cp, &s).unwrap();

        // registry indicates a running client
        crate::overlay::set_state("srv1", ClientConnectionState::Connected).await;
        crate::overlay::set_tools("srv1", 3).await;
        let map = compute_client_status_map_with(&cp).await;
        assert!(!map.is_empty());
        let cs = map
            .values()
            .find(|v| v.name == "srv1")
            .expect("srv1 present");
        assert_eq!(cs.tools, 3);
    }

    #[tokio::test]
    #[serial_test::serial]
    async fn overlay_precedence_over_registry() {
        crate::overlay::clear_all().await;
        let cp = TestProvider::new();
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig {
            name: "srv_overlay".into(),
            description: "d".into(),
            transport: TransportType::StreamableHttp,
            command: String::new(),
            args: vec![],
            env: Default::default(),
            endpoint: "http://127.0.0.1".into(),
            headers: Default::default(),
            enabled: true,
        });
        save_settings_with(&cp, &s).unwrap();

        crate::overlay::set_state("srv_overlay", ClientConnectionState::Errored).await;
        crate::overlay::set_error("srv_overlay", Some("no token".into())).await;
        crate::overlay::set_auth_required("srv_overlay", true).await;
        crate::overlay::set_oauth_authenticated("srv_overlay", true).await;

        let map = compute_client_status_map_with(&cp).await;
        let cs = map
            .values()
            .find(|v| v.name == "srv_overlay")
            .expect("srv present");
        assert_eq!(cs.state, ClientConnectionState::Errored); // overlay wins
        assert_eq!(cs.last_error.as_deref(), Some("no token"));
        assert!(cs.authorization_required);
        assert!(cs.oauth_authenticated);
    }
}
