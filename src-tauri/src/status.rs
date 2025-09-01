use futures::future::join_all;
use std::collections::HashMap;

use crate::config::{load_clients_state_with, load_settings_with, ClientStatus, ConfigProvider, MCPServerConfig, OsConfigProvider, TransportType};

pub async fn compute_client_status_map_with<E, Fut, LF>(
    cp: &dyn ConfigProvider,
    registry_names: E,
    lister: LF,
) -> HashMap<String, ClientStatus>
where
    E: IntoIterator<Item = String>,
    LF: Fn(MCPServerConfig) -> Fut + Clone + Send + Sync,
    Fut: std::future::Future<Output = Result<Vec<serde_json::Value>, String>>,
{
    let settings = load_settings_with(cp);
    let mut map: HashMap<String, ClientStatus> = HashMap::new();
    let mut tasks = Vec::new();
    for server in settings.mcp_servers {
        let name = server.name.clone();
        let transport = server.transport.clone();
        let enabled = server.enabled;
        map.insert(
            name.clone(),
            ClientStatus {
                name: name.clone(),
                connected: false,
                tools: 0,
                last_error: None,
                authorization_required: server.requires_auth.unwrap_or(false),
                oauth_authenticated: false,
            },
        );
        if enabled && matches!(transport, Some(TransportType::TransportStreamableHTTP)) {
            let list_fn = lister.clone();
            tasks.push(async move {
                if let Ok(tools) = list_fn(server).await {
                    return Some((name, tools.len() as u32));
                }
                None
            });
        }
    }
    for r in join_all(tasks).await.into_iter().flatten() {
        if let Some(cs) = map.get_mut(&r.0) { cs.tools = r.1; }
    }
    for n in registry_names { if let Some(cs) = map.get_mut(&n) { cs.connected = true; } }
    let overlay = load_clients_state_with(cp);
    for (name, state) in overlay.0.into_iter() {
        if let Some(cs) = map.get_mut(&name) {
            if let Some(v) = state.connected { cs.connected = v; }
            if state.last_error.is_some() { cs.last_error = state.last_error; }
            if let Some(v) = state.authorization_required { cs.authorization_required = v; }
            if let Some(v) = state.oauth_authenticated { cs.oauth_authenticated = v; }
        }
    }
    map
}

pub async fn compute_client_status_map<E, Fut, LF>(
    registry_names: E,
    lister: LF,
) -> HashMap<String, ClientStatus>
where
    E: IntoIterator<Item = String>,
    LF: Fn(MCPServerConfig) -> Fut + Clone + Send + Sync,
    Fut: std::future::Future<Output = Result<Vec<serde_json::Value>, String>>,
{
    compute_client_status_map_with(&OsConfigProvider, registry_names, lister).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{
        default_settings, save_clients_state_with, save_settings_with, ClientState, ClientsState,
        ConfigProvider, MCPServerConfig, TransportType,
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
    async fn tools_count_and_connected_logic() {
        let cp = TestProvider::new();
        // settings with one enabled HTTP server
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig {
            name: "srv1".into(),
            description: "d".into(),
            transport: Some(TransportType::TransportStreamableHTTP),
            command: String::new(),
            args: None,
            env: None,
            endpoint: Some("http://127.0.0.1".into()),
            headers: None,
            requires_auth: Some(false),
            enabled: true,
        });
        save_settings_with(&cp, &s).unwrap();

        // registry indicates a running client
        let reg = vec!["srv1".to_string()];
        // lister returns 3 tools
        let lister = |_cfg: MCPServerConfig| async move {
            Ok(vec![
                serde_json::json!({"name":"a"}),
                serde_json::json!({"name":"b"}),
                serde_json::json!({"name":"c"}),
            ])
        };

        let map = compute_client_status_map_with(&cp, reg, lister).await;
        assert!(!map.is_empty());
        let cs = map.values().find(|v| v.name == "srv1").expect("srv1 present");
        assert_eq!(cs.tools, 3);
    }

    #[tokio::test]
    async fn overlay_precedence_over_registry() {
        let cp = TestProvider::new();
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig {
            name: "srv1".into(),
            description: "d".into(),
            transport: Some(TransportType::TransportStreamableHTTP),
            command: String::new(),
            args: None,
            env: None,
            endpoint: Some("http://127.0.0.1".into()),
            headers: None,
            requires_auth: Some(true),
            enabled: true,
        });
        save_settings_with(&cp, &s).unwrap();

        // Overlay marks connected=false even if registry claims connected
        let mut overlay = ClientsState::default();
        overlay.0.insert(
            "srv1".into(),
            ClientState {
                connected: Some(false),
                last_error: Some("no token".into()),
                authorization_required: Some(true),
                oauth_authenticated: Some(true),
            },
        );
        save_clients_state_with(&cp, &overlay).unwrap();

        let reg = vec!["srv1".to_string()];
        let lister = |_cfg: MCPServerConfig| async move { Ok::<_, String>(vec![]) };
        let map = compute_client_status_map_with(&cp, reg, lister).await;
        let cs = map.values().find(|v| v.name == "srv1").expect("srv1 present");
        assert_eq!(cs.connected, false); // overlay wins
        assert_eq!(cs.last_error.as_deref(), Some("no token"));
        assert_eq!(cs.authorization_required, true);
        assert_eq!(cs.oauth_authenticated, true);
    }
}
