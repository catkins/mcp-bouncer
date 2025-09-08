use std::collections::HashMap;

use crate::types::ToolInfo;
use crate::config::ConfigProvider;

static TOOLS_CACHE: std::sync::OnceLock<tokio::sync::Mutex<HashMap<String, Vec<ToolInfo>>>> =
    std::sync::OnceLock::new();

fn cache() -> &'static tokio::sync::Mutex<HashMap<String, Vec<ToolInfo>>> {
    TOOLS_CACHE.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

pub async fn set(name: &str, tools: Vec<ToolInfo>) {
    let mut g = cache().lock().await;
    g.insert(name.to_string(), tools);
}

pub async fn get(name: &str) -> Option<Vec<ToolInfo>> {
    let g = cache().lock().await;
    g.get(name).cloned()
}

pub async fn clear(name: &str) {
    let mut g = cache().lock().await;
    g.remove(name);
}

pub async fn clear_all() {
    let mut g = cache().lock().await;
    g.clear();
}

// Helper: filter tools list using persisted enablement map
pub fn filter_enabled_with(
    cp: &dyn ConfigProvider,
    client_name: &str,
    mut list: Vec<ToolInfo>,
) -> Vec<ToolInfo> {
    let state = crate::config::load_tools_state_with(cp);
    list.retain(|t| {
        state
            .0
            .get(client_name)
            .and_then(|m| m.get(&t.name))
            .copied()
            .unwrap_or(true)
    });
    list
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigProvider;

    #[tokio::test]
    async fn set_and_get_round_trip() {
        clear_all().await;
        let items = vec![ToolInfo {
            name: "srv::tool".to_string(),
            description: Some("desc".to_string()),
            input_schema: Some(serde_json::json!({"type":"object"})),
        }];
        set("srv", items.clone()).await;
        let out = get("srv").await.unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, items[0].name);
        assert_eq!(out[0].description, items[0].description);
        assert_eq!(out[0].input_schema, items[0].input_schema);
    }

    #[tokio::test]
    async fn filter_respects_persistence_default_true() {
        // Use a unique temp config provider and write toggle map disabling a tool
        #[derive(Clone)]
        struct TempCP(std::path::PathBuf);
        impl TempCP { fn new() -> Self { let d = std::env::temp_dir().join(format!("mcp-bouncer-tools-cache-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos())); std::fs::create_dir_all(&d).unwrap(); Self(d) } }
        impl ConfigProvider for TempCP { fn base_dir(&self) -> std::path::PathBuf { self.0.clone() } }
        let cp = TempCP::new();
        crate::config::save_tools_toggle_with(&cp, "srv", "x", false).unwrap();
        let list = vec![
            ToolInfo { name: "x".into(), description: None, input_schema: None },
            ToolInfo { name: "y".into(), description: None, input_schema: None },
        ];
        let filtered = filter_enabled_with(&cp, "srv", list);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "y");
    }
}
