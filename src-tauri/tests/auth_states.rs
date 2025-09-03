use mcp_bouncer::config::{default_settings, save_settings_with, ClientConnectionState, MCPServerConfig, TransportType};
use mcp_bouncer::status::compute_client_status_map_with;
mod common;
use common::TestProvider;

#[tokio::test]
async fn mark_unauthorized_sets_state_and_clears_error() {
    let cp = TestProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "srv1".into(),
        description: "d".into(),
        transport: Some(TransportType::StreamableHttp),
        command: String::new(),
        args: None,
        env: None,
        endpoint: Some("http://127.0.0.1".into()),
        headers: None,
        requires_auth: Some(false),
        enabled: true,
    });
    save_settings_with(&cp, &s).unwrap();

    mcp_bouncer::overlay::set_error("srv1", Some("boom".into())).await;
    mcp_bouncer::overlay::mark_unauthorized("srv1").await;

    let map = compute_client_status_map_with(&cp).await;
    let cs = map.get("srv1").expect("srv present");
    assert_eq!(cs.state, ClientConnectionState::RequiresAuthorization);
    assert!(cs.authorization_required);
    assert!(!cs.oauth_authenticated);
    assert_eq!(cs.last_error, None, "last_error should be cleared after 401 inference");
}

#[tokio::test]
async fn authorizing_state_is_exposed() {
    let cp = TestProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "srv2".into(),
        description: "d".into(),
        transport: Some(TransportType::StreamableHttp),
        command: String::new(),
        args: None,
        env: None,
        endpoint: Some("http://127.0.0.1".into()),
        headers: None,
        requires_auth: Some(false),
        enabled: true,
    });
    save_settings_with(&cp, &s).unwrap();

    mcp_bouncer::overlay::set_state("srv2", ClientConnectionState::Authorizing).await;
    let map = compute_client_status_map_with(&cp).await;
    let cs = map.get("srv2").expect("srv present");
    assert_eq!(cs.state, ClientConnectionState::Authorizing);
}
