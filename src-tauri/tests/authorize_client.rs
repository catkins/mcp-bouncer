use mcp_bouncer::app_logic;
use mcp_bouncer::config::{
    load_clients_state_with,
    load_settings_with,
    save_settings_with,
    ConfigProvider,
    MCPServerConfig,
    TransportType,
    default_settings,
};
use mcp_bouncer::events::EventEmitter;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
struct TempConfigProvider { base: PathBuf }
impl TempConfigProvider {
    fn new() -> Self {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("mcp-bouncer-auth-{}-{}", std::process::id(), stamp));
        fs::create_dir_all(&dir).unwrap();
        Self { base: dir }
    }
}
impl ConfigProvider for TempConfigProvider {
    fn base_dir(&self) -> PathBuf { self.base.clone() }
}

#[derive(Clone)]
struct NoopEmitter;
impl EventEmitter for NoopEmitter { fn emit(&self, _e:&str, _p:&serde_json::Value) {} }

#[tokio::test]
async fn authorize_client_sets_header_and_state() {
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "srv".into(),
        description: "d".into(),
        transport: Some(TransportType::TransportStreamableHTTP),
        command: "".into(),
        args: None,
        env: None,
        endpoint: Some("http://localhost".into()),
        headers: None,
        requires_auth: Some(true),
        enabled: true,
    });
    save_settings_with(&cp, &s).unwrap();

    app_logic::authorize_client(&cp, &NoopEmitter, "srv", "secret")
        .await
        .unwrap();

    let loaded = load_settings_with(&cp);
    let auth = loaded.mcp_servers[0]
        .headers
        .as_ref()
        .and_then(|h| h.get("Authorization"))
        .cloned();
    assert_eq!(auth.as_deref(), Some("Bearer secret"));

    let state = load_clients_state_with(&cp);
    assert_eq!(
        state.0.get("srv").and_then(|st| st.oauth_authenticated),
        Some(true)
    );
}
