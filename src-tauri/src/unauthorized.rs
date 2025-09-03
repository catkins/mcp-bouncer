use crate::overlay;

/// Probe the given HTTP endpoint and return true if it responds with 401.
pub async fn probe_unauthorized(endpoint: &str) -> bool {
    if endpoint.is_empty() { return false; }
    if let Ok(resp) = reqwest::Client::default().get(endpoint).send().await {
        return resp.status().as_u16() == 401;
    }
    false
}

/// If an endpoint is provided and probing returns 401, mark overlay as unauthorized.
pub async fn on_possible_unauthorized(name: &str, endpoint: Option<&str>) {
    if let Some(ep) = endpoint { if probe_unauthorized(ep).await { overlay::mark_unauthorized(name).await; } }
}

