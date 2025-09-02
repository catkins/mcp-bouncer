use axum::Router;
use futures::future::join_all;
use rmcp::model as mcp;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use rmcp::{RoleServer, Service as McpService};

use crate::client::{ensure_rmcp_client, fetch_tools_for_cfg};
use crate::config::{
    load_settings_with, ConfigProvider, MCPServerConfig,
};
use crate::events::incoming_clients_updated;
use crate::events::{EventEmitter};
use crate::incoming::record_connect;

// Helper: JSON path extraction for InitializeRequest params (duplicated from main for reuse)
fn extract_str<'a>(val: &'a serde_json::Value, paths: &[&str]) -> Option<&'a str> {
    for path in paths {
        let mut cur = val;
        let mut ok = true;
        for seg in path.split('.') {
            if let Some(obj) = cur.as_object() {
                if let Some(next) = obj.get(seg) { cur = next; } else { ok = false; break; }
            } else { ok = false; break; }
        }
        if ok { if let Some(s) = cur.as_str() { return Some(s); } }
    }
    None
}

#[derive(Clone)]
pub struct BouncerService<E, CP>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
{
    pub emitter: E,
    pub cp: CP,
}

impl<E, CP> McpService<RoleServer> for BouncerService<E, CP>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
{
    async fn handle_request(
        &self,
        request: mcp::ClientRequest,
        _context: rmcp::service::RequestContext<RoleServer>,
    ) -> Result<mcp::ServerResult, mcp::ErrorData> {
        match request {
            mcp::ClientRequest::InitializeRequest(req) => {
                let capabilities = mcp::ServerCapabilities::builder()
                    .enable_logging()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build();
                let result = mcp::InitializeResult {
                    protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                    capabilities,
                    server_info: mcp::Implementation {
                        name: "MCP Bouncer".into(),
                        version: env!("CARGO_PKG_VERSION").into(),
                    },
                    instructions: None,
                };
                if let Ok(val) = serde_json::to_value(&req) {
                    let name = extract_str(&val, &[
                        "clientInfo.name", "client_info.name", "client.name",
                        "params.clientInfo.name", "params.client_info.name", "params.client.name",
                    ]).unwrap_or("unknown");
                    let version = extract_str(&val, &[
                        "clientInfo.version", "client_info.version", "client.version",
                        "params.clientInfo.version", "params.client_info.version", "params.client.version",
                    ]).unwrap_or("");
                    let title = extract_str(&val, &[
                        "clientInfo.title", "client_info.title", "title",
                        "params.clientInfo.title", "params.client_info.title", "params.title",
                    ]).map(|s| s.to_string());
                    record_connect(name.to_string(), version.to_string(), title).await;
                    incoming_clients_updated(&self.emitter, "connect");
                }
                Ok(mcp::ServerResult::InitializeResult(result))
            }
            mcp::ClientRequest::ListToolsRequest(_req) => {
                let s = load_settings_with(&self.cp);
                let servers: Vec<_> = s.mcp_servers.into_iter().filter(|c| c.enabled).collect();
                let tools = aggregate_tools(servers, std::time::Duration::from_secs(6)).await;
                Ok(mcp::ServerResult::ListToolsResult(mcp::ListToolsResult { tools, next_cursor: None }))
            }
            mcp::ClientRequest::CallToolRequest(req) => {
                let name = req.params.name.to_string();
                let (server_name, tool_name) = name
                    .split_once("::")
                    .map(|(a, b)| (a.to_string(), b.to_string()))
                    .unwrap_or((String::new(), name.clone()));
                let args_obj = req
                    .params
                    .arguments
                    .clone()
                    .map(serde_json::Value::Object)
                    .and_then(|v| v.as_object().cloned());
                let cfg_opt = if !server_name.is_empty() {
                    load_settings_with(&self.cp)
                        .mcp_servers
                        .into_iter()
                        .find(|c| c.name == server_name)
                } else {
                    load_settings_with(&self.cp).mcp_servers.into_iter().find(|c| c.enabled)
                };
                if let Some(cfg) = cfg_opt {
                    match ensure_rmcp_client(&cfg.name, &cfg).await {
                        Ok(client) => match client
                            .call_tool(mcp::CallToolRequestParam { name: tool_name.into(), arguments: args_obj })
                            .await
                        {
                            Ok(res) => Ok(mcp::ServerResult::CallToolResult(res)),
                            Err(e) => {
                                let msg = e.to_string();
                                let lower = msg.to_ascii_lowercase();
                                if lower.contains("401") || lower.contains("unauthorized") {
                                    crate::overlay::set_auth_required(&cfg.name, true).await;
                                    crate::overlay::set_oauth_authenticated(&cfg.name, false).await;
                                }
                                Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                                    content: vec![mcp::Content::text(format!("error: {e}"))],
                                    structured_content: None,
                                    is_error: Some(true),
                                }))
                            }
                        },
                        Err(e) => Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                            content: vec![mcp::Content::text(format!("error: {e}"))],
                            structured_content: None,
                            is_error: Some(true),
                        })),
                    }
                } else {
                    Ok(mcp::ServerResult::CallToolResult(mcp::CallToolResult {
                        content: vec![mcp::Content::text("no server".to_string())],
                        structured_content: None,
                        is_error: Some(true),
                    }))
                }
            }
            other => {
                let _ = other;
                Ok(mcp::ServerResult::empty(()))
            }
        }
    }

    async fn handle_notification(
        &self,
        _notification: mcp::ClientNotification,
        _context: rmcp::service::NotificationContext<RoleServer>,
    ) -> Result<(), mcp::ErrorData> {
        Ok(())
    }

    fn get_info(&self) -> mcp::ServerInfo {
        mcp::ServerInfo {
            protocol_version: mcp::ProtocolVersion::V_2025_03_26,
            capabilities: mcp::ServerCapabilities::builder()
                .enable_logging()
                .enable_tools()
                .enable_tool_list_changed()
                .build(),
            server_info: mcp::Implementation { name: "MCP Bouncer".into(), version: env!("CARGO_PKG_VERSION").into() },
            instructions: None,
        }
    }
}

fn to_mcp_tool(server: &str, v: &serde_json::Value) -> Option<mcp::Tool> {
    let name = v.get("name")?.as_str()?.to_string();
    let description = v.get("description").and_then(|d| d.as_str()).map(|s| s.to_string());
    let schema_obj = v
        .get("inputSchema")
        .or_else(|| v.get("input_schema"))
        .and_then(|s| s.as_object().cloned())
        .unwrap_or_default();
    let fullname = format!("{}::{}", server, name);
    Some(mcp::Tool::new(fullname, description.unwrap_or_default(), schema_obj))
}

async fn aggregate_tools(
    servers: Vec<MCPServerConfig>,
    timeout: std::time::Duration,
) -> Vec<mcp::Tool> {
    let tasks = servers.into_iter().map(|cfg| async move {
        let name = cfg.name.clone();
        let fut = async move {
            let boxed = Box::new(cfg);
            fetch_tools_for_cfg(&boxed).await
        };
        match tokio::time::timeout(timeout, fut).await {
            Ok(Ok(list)) => Some((name, list)),
            _ => None,
        }
    });
    let mut tools: Vec<mcp::Tool> = Vec::new();
    for res in join_all(tasks).await.into_iter().flatten() {
        let (server_name, list) = res;
        for item in list {
            if let Some(t) = to_mcp_tool(&server_name, &item) {
                tools.push(t);
            }
        }
    }
    tools
}

pub async fn start_http_server<E, CP>(
    emitter: E,
    cp: CP,
    addr: std::net::SocketAddr,
) -> Result<(tokio::task::JoinHandle<()>, std::net::SocketAddr), String>
where
    E: EventEmitter + Clone + Send + Sync + 'static,
    CP: ConfigProvider + Clone + Send + Sync + 'static,
{
    let service: StreamableHttpService<BouncerService<E, CP>, LocalSessionManager> = StreamableHttpService::new(
        move || Ok(BouncerService { emitter: emitter.clone(), cp: cp.clone() }),
        Default::default(),
        StreamableHttpServerConfig { stateful_mode: true, sse_keep_alive: Some(std::time::Duration::from_secs(15)) },
    );
    let router = Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| e.to_string())?;
    let local = listener.local_addr().map_err(|e| e.to_string())?;
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok((handle, local))
}
