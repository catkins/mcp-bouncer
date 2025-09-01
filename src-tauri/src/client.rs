use std::{collections::HashMap, sync::Arc};

use rmcp::service::RoleClient;
use rmcp::transport::{
    streamable_http_client::StreamableHttpClientTransportConfig,
    StreamableHttpClientTransport,
    TokioChildProcess,
};
use rmcp::ServiceExt;

use crate::config::{MCPServerConfig, TransportType};

pub type ClientService = rmcp::service::RunningService<RoleClient, ()>;
pub type ClientRegistry = tokio::sync::Mutex<HashMap<String, Arc<ClientService>>>;

// Global client registry used by Tauri commands
static CLIENT_REGISTRY_INST: std::sync::OnceLock<ClientRegistry> = std::sync::OnceLock::new();

pub fn client_registry() -> &'static ClientRegistry {
    CLIENT_REGISTRY_INST.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

pub async fn ensure_rmcp_client(
    name: &str,
    cfg: &MCPServerConfig,
) -> Result<Arc<ClientService>, String> {
    let reg = client_registry();
    let mut guard = reg.lock().await;
    if let Some(c) = guard.get(name) { return Ok(c.clone()); }
    let service = match cfg.transport {
        Some(TransportType::TransportStreamableHTTP) => {
            let endpoint = cfg.endpoint.clone().unwrap_or_default();
            if endpoint.is_empty() { return Err("no endpoint".into()); }
            let mut conf = StreamableHttpClientTransportConfig::with_uri(endpoint);
            if let Some(hmap) = &cfg.headers {
                if let Some(auth) = hmap.get("Authorization").cloned() {
                    let token = auth.strip_prefix("Bearer ").unwrap_or(&auth).to_string();
                    conf = conf.auth_header(token);
                }
            }
            let transport = StreamableHttpClientTransport::from_config(conf);
            ().serve(transport)
                .await
                .map_err(|e| format!("rmcp serve: {e}"))?
        }
        Some(TransportType::TransportStdio) => {
            let cmd = cfg.command.clone();
            if cmd.is_empty() { return Err("missing command".into()); }
            let mut command = tokio::process::Command::new(cmd);
            if let Some(args) = &cfg.args { command.args(args); }
            if let Some(envmap) = &cfg.env { for (k, v) in envmap { command.env(k, v); } }
            let transport = TokioChildProcess::new(command).map_err(|e| format!("spawn: {e}"))?;
            ().serve(transport).await.map_err(|e| format!("rmcp serve: {e}"))?
        }
        _ => return Err("unsupported transport".into()),
    };
    let arc = Arc::new(service);
    guard.insert(name.to_string(), arc.clone());
    Ok(arc)
}

pub async fn remove_rmcp_client(name: &str) -> Result<(), String> {
    let reg = client_registry();
    let mut guard = reg.lock().await;
    if let Some(service) = guard.remove(name) { service.cancellation_token().cancel(); }
    Ok(())
}

pub async fn fetch_tools_for_cfg(cfg: &MCPServerConfig) -> Result<Vec<serde_json::Value>, String> {
    let client = ensure_rmcp_client(&cfg.name, cfg).await?;
    let tools = client.list_all_tools().await.map_err(|e| format!("rmcp list tools: {e}"))?;
    let vals: Vec<serde_json::Value> = tools
        .into_iter()
        .map(|t| serde_json::to_value(t).unwrap_or(serde_json::json!({})))
        .collect();
    Ok(vals)
}

// Helper: expose names present in registry (for status computation)
pub async fn registry_names() -> Vec<String> {
    let reg = client_registry();
    let guard = reg.lock().await;
    guard.keys().cloned().collect()
}
