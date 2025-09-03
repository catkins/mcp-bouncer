use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};

// Types shared with Tauri commands and service

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    #[serde(rename = "stdio")]
    Stdio,
    #[serde(rename = "sse")]
    Sse,
    #[serde(rename = "streamable_http")]
    StreamableHttp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    pub name: String,
    pub description: String,
    pub transport: Option<TransportType>,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub endpoint: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub requires_auth: Option<bool>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub mcp_servers: Vec<MCPServerConfig>,
    pub listen_addr: String,
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClientConnectionState {
    Disconnected,
    Connecting,
    Errored,
    Connected,
    RequiresAuthorization,
    Authorizing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientStatus {
    pub name: String,
    pub state: ClientConnectionState,
    pub tools: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub authorization_required: bool,
    pub oauth_authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingClient {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connected_at: Option<String>,
}

// Deprecated persisted client state removed; runtime overlay is in-memory only

// Config paths abstraction to make IO testable
pub trait ConfigProvider: Send + Sync {
    fn base_dir(&self) -> PathBuf;
}

#[derive(Default, Clone)]
pub struct OsConfigProvider;

impl ConfigProvider for OsConfigProvider {
    fn base_dir(&self) -> PathBuf {
        let base = dirs::config_dir().unwrap_or_else(|| dirs::home_dir().unwrap_or_default());
        base.join("mcp-bouncer")
    }
}

pub fn default_settings() -> Settings {
    Settings { mcp_servers: Vec::new(), listen_addr: "http://localhost:8091/mcp".to_string(), auto_start: false }
}

pub fn settings_path(cp: &dyn ConfigProvider) -> PathBuf { cp.base_dir().join("settings.json") }

pub fn load_settings_with(cp: &dyn ConfigProvider) -> Settings {
    let path = settings_path(cp);
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&content) { return s; }
    }
    default_settings()
}

pub fn save_settings_with(cp: &dyn ConfigProvider, settings: &Settings) -> Result<(), String> {
    fs::create_dir_all(cp.base_dir()).map_err(|e| format!("create config dir: {e}"))?;
    let path = settings_path(cp);
    let content = serde_json::to_string_pretty(settings).map_err(|e| format!("to json: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("write settings: {e}"))
}

// Convenience OS-backed wrappers for production code
pub fn load_settings() -> Settings { load_settings_with(&OsConfigProvider) }
pub fn save_settings(settings: &Settings) -> Result<(), String> { save_settings_with(&OsConfigProvider, settings) }
pub fn config_dir() -> PathBuf { OsConfigProvider.base_dir() }

// Tools toggle persisted map helpers
#[derive(Serialize, Deserialize, Default)]
pub struct ToolsState(pub HashMap<String, HashMap<String, bool>>);

pub fn tools_state_path(cp: &dyn ConfigProvider) -> PathBuf { cp.base_dir().join("tools_state.json") }

pub fn save_tools_toggle_with(
    cp: &dyn ConfigProvider,
    client_name: &str,
    tool_name: &str,
    enabled: bool,
) -> Result<(), String> {
    let path = tools_state_path(cp);
    let mut state: ToolsState = fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    state.0.entry(client_name.to_string()).or_default().insert(tool_name.to_string(), enabled);
    let content = serde_json::to_string_pretty(&state).map_err(|e| format!("to json: {e}"))?;
    fs::create_dir_all(cp.base_dir()).map_err(|e| format!("create dir: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("write tools state: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone)]
    struct TempConfigProvider { base: PathBuf }

    impl TempConfigProvider { fn new() -> Self { let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis(); let dir = std::env::temp_dir().join(format!("mcp-bouncer-test-{}-{}", std::process::id(), stamp)); fs::create_dir_all(&dir).unwrap(); Self { base: dir } } }

    impl ConfigProvider for TempConfigProvider { fn base_dir(&self) -> PathBuf { self.base.clone() } }

    #[test]
    fn settings_roundtrip() {
        let cp = TempConfigProvider::new();
        let mut s = default_settings();
        s.mcp_servers.push(MCPServerConfig{ name: "srv".into(), description: "d".into(), transport: Some(TransportType::StreamableHttp), command: "".into(), args: None, env: None, endpoint: Some("http://127.0.0.1".into()), headers: None, requires_auth: Some(false), enabled: true });
        save_settings_with(&cp, &s).unwrap();
        let loaded = load_settings_with(&cp);
        assert_eq!(loaded.mcp_servers.len(), 1);
        assert_eq!(loaded.listen_addr, s.listen_addr);
    }

    #[test]
    fn tools_toggle_persists() {
        let cp = TempConfigProvider::new();
        save_tools_toggle_with(&cp, "clientA", "tool1", true).unwrap();
        let data = std::fs::read_to_string(tools_state_path(&cp)).unwrap();
        assert!(data.contains("clientA"));
        assert!(data.contains("tool1"));
    }
}
