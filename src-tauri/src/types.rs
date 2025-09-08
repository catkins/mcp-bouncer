use serde::{Deserialize, Serialize};
use specta::Type;

// Shared ToolInfo type between backend and frontend bridge
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ToolInfo {
    pub name: String,
    #[specta(optional)]
    pub description: Option<String>,
    #[specta(optional)]
    pub input_schema: Option<serde_json::Value>,
}

