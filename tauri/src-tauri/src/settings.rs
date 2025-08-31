use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;

// =========
// Structs
// =========

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    Stdio,
    Sse,
    StreamableHttp,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MCPServerConfig {
    pub name: String,
    pub description: String,
    pub transport: TransportType,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub requires_auth: bool,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    #[serde(default)]
    pub mcp_servers: Vec<MCPServerConfig>,
    pub listen_addr: String,
    #[serde(default)]
    pub auto_start: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            mcp_servers: Vec::new(),
            listen_addr: "localhost:8091".to_string(),
            auto_start: false,
        }
    }
}

// =========
// State
// =========

pub struct SettingsManager {
    pub settings: Mutex<Settings>,
    pub file_path: PathBuf,
}

impl SettingsManager {
    pub fn new() -> Result<Self, Error> {
        let xdg_dirs = xdg::BaseDirectories::with_prefix("mcp-bouncer")?;
        let config_path = xdg_dirs.place_config_file("settings.json")?;

        let settings = if config_path.exists() {
            let content = fs::read_to_string(&config_path)?;
            serde_json::from_str(&content)?
        } else {
            let default_settings = Settings::default();
            let content = serde_json::to_string_pretty(&default_settings)?;
            fs::write(&config_path, content)?;
            default_settings
        };

        Ok(Self {
            settings: Mutex::new(settings),
            file_path: config_path,
        })
    }

    pub fn save_settings(&self) -> Result<(), Error> {
        let settings = self.settings.lock().unwrap();
        let content = serde_json::to_string_pretty(&*settings)?;
        fs::write(&self.file_path, content)?;
        Ok(())
    }
}


// =========
// Errors
// =========

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Xdg(#[from] xdg::BaseDirectoriesError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    SerdeJson(#[from] serde_json::Error),
}

// We must implement this to use it as a return type in Tauri commands
impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

// =========
// Commands
// =========

#[tauri::command]
pub fn get_settings(state: tauri::State<SettingsManager>) -> Result<Settings, Error> {
    Ok(state.settings.lock().unwrap().clone())
}

#[tauri::command]
pub async fn update_settings(
    settings: Settings,
    state: tauri::State<'_, SettingsManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), Error> {
    *state.settings.lock().unwrap() = settings.clone();
    state.save_settings()?;
    app_handle.emit("settings:updated", settings).unwrap();
    Ok(())
}

#[tauri::command]
pub async fn add_mcp_server(
    config: MCPServerConfig,
    state: tauri::State<'_, SettingsManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), Error> {
    let mut settings = state.settings.lock().unwrap();
    if settings.mcp_servers.iter().any(|s| s.name == config.name) {
        // In a real app, you'd return a proper error here
        // For now, we'll just ignore it
        return Ok(());
    }
    settings.mcp_servers.push(config);
    state.save_settings()?;
    app_handle.emit("settings:updated", (*settings).clone()).unwrap();
    Ok(())
}

#[tauri::command]
pub async fn remove_mcp_server(
    name: String,
    state: tauri::State<'_, SettingsManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), Error> {
    let mut settings = state.settings.lock().unwrap();
    settings.mcp_servers.retain(|s| s.name != name);
    state.save_settings()?;
    app_handle.emit("settings:updated", (*settings).clone()).unwrap();
    Ok(())
}

#[tauri::command]
pub async fn update_mcp_server(
    name: String,
    config: MCPServerConfig,
    state: tauri::State<'_, SettingsManager>,
    app_handle: tauri::AppHandle,
) -> Result<(), Error> {
    let mut settings = state.settings.lock().unwrap();
    if let Some(server) = settings.mcp_servers.iter_mut().find(|s| s.name == name) {
        *server = config;
    }
    state.save_settings()?;
    app_handle.emit("settings:updated", (*settings).clone()).unwrap();
    Ok(())
}

#[tauri::command]
pub fn open_config_directory(state: tauri::State<SettingsManager>) -> Result<(), Error> {
    if let Some(parent) = state.file_path.parent() {
        // The `opener` crate is recommended by Tauri for opening files/URLs
        opener::open(parent).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    }
    Ok(())
}
