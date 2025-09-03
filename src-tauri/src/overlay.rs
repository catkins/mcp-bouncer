use std::collections::HashMap;

use crate::config::ClientConnectionState;

#[derive(Debug, Clone)]
pub struct OverlayEntry {
    pub state: ClientConnectionState,
    pub last_error: Option<String>,
    pub authorization_required: bool,
    pub oauth_authenticated: bool,
    pub tools: u32,
}

static OVERLAY: std::sync::OnceLock<tokio::sync::Mutex<HashMap<String, OverlayEntry>>> =
    std::sync::OnceLock::new();

fn overlay_map() -> &'static tokio::sync::Mutex<HashMap<String, OverlayEntry>> {
    OVERLAY.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

fn default_entry() -> OverlayEntry {
    OverlayEntry {
        state: ClientConnectionState::Disconnected,
        last_error: None,
        authorization_required: false,
        oauth_authenticated: false,
        tools: 0,
    }
}

fn entry_mut<'a>(map: &'a mut HashMap<String, OverlayEntry>, name: &str) -> &'a mut OverlayEntry {
    map.entry(name.to_string()).or_insert_with(default_entry)
}

pub async fn set_state(name: &str, state: ClientConnectionState) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.state = state;
}

pub async fn set_error(name: &str, err: Option<String>) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.last_error = err;
}

pub async fn set_auth_required(name: &str, required: bool) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.authorization_required = required;
}

pub async fn set_oauth_authenticated(name: &str, ok: bool) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.oauth_authenticated = ok;
}

pub async fn set_tools(name: &str, tools: u32) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.tools = tools;
}

pub async fn clear_all() {
    let mut g = overlay_map().lock().await;
    g.clear();
}

pub async fn snapshot() -> HashMap<String, OverlayEntry> {
    overlay_map().lock().await.clone()
}

// Helper to mark a client as requiring authorization (e.g., after a 401),
// and clear any oauth_authenticated flag.
pub async fn mark_unauthorized(name: &str) {
    let mut g = overlay_map().lock().await;
    let e = entry_mut(&mut g, name);
    e.authorization_required = true;
    e.oauth_authenticated = false;
    e.state = ClientConnectionState::RequiresAuthorization;
}
