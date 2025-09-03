use std::fs;

use mcp_bouncer::config::{MCPServerConfig, Settings, TransportType};
use mcp_bouncer::config::{
    default_settings, load_settings_with, save_settings_with, save_tools_toggle_with,
    tools_state_path,
};
mod common;
use common::TestProvider;

#[test]
fn settings_and_tools_persist() {
    let cp = TestProvider::new();
    let mut s: Settings = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "srv1".into(),
        description: "test".into(),
        transport: Some(TransportType::StreamableHttp),
        command: "".into(),
        args: None,
        env: None,
        endpoint: Some("http://127.0.0.1".into()),
        headers: None,
        requires_auth: Some(false),
        enabled: true,
    });
    save_settings_with(&cp, &s).unwrap();
    let loaded = load_settings_with(&cp);
    assert_eq!(loaded.mcp_servers.len(), 1);

    save_tools_toggle_with(&cp, "srv1", "toolX", true).unwrap();
    let content = fs::read_to_string(tools_state_path(&cp)).unwrap();
    assert!(content.contains("toolX"));
}
