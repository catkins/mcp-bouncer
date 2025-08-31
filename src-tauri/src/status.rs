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

    // Additional status tests can be added using compute_client_status_map_with(cp, ...)
}
