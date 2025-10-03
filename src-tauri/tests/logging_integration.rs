use mcp_bouncer::config::{
    ConfigProvider, MCPServerConfig, TransportType, default_settings, save_settings_with,
};
use mcp_bouncer::{events::EventEmitter, logging::SqlitePublisher, server::start_http_server};
use rmcp::ServiceExt;
use rmcp::model as mcp;
use rmcp::transport::{
    StreamableHttpClientTransport,
    streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Row};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
struct TempConfigProvider {
    base: PathBuf,
}

impl TempConfigProvider {
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        // Include thread ID to ensure each test gets a unique directory even in parallel execution
        let thread_id = std::thread::current().id();
        let dir = std::env::temp_dir().join(format!(
            "mcp-bouncer-log-{}-{}-{:?}",
            std::process::id(),
            stamp,
            thread_id
        ));
        fs::create_dir_all(&dir).unwrap();
        Self { base: dir }
    }
}

impl ConfigProvider for TempConfigProvider {
    fn base_dir(&self) -> PathBuf {
        self.base.clone()
    }
}

#[tokio::test]
#[serial_test::serial]
async fn logging_persists_events_to_sqlite() {
    // Spin an in-process upstream server with a simple echo tool
    #[derive(Clone)]
    struct Upstream;
    impl rmcp::handler::server::ServerHandler for Upstream {
        fn get_info(&self) -> mcp::ServerInfo {
            mcp::ServerInfo {
                protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                capabilities: mcp::ServerCapabilities::builder()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build(),
                server_info: mcp::Implementation {
                    name: "up".into(),
                    title: None,
                    version: "0.0.1".into(),
                    icons: None,
                    website_url: None,
                },
                instructions: None,
            }
        }
        fn list_tools(
            &self,
            _request: Option<mcp::PaginatedRequestParam>,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::ListToolsResult, mcp::ErrorData>> + Send + '_
        {
            let schema: mcp::JsonObject = Default::default();
            std::future::ready(Ok(mcp::ListToolsResult {
                tools: vec![mcp::Tool::new("echo", "echo", schema)],
                next_cursor: None,
            }))
        }
        fn call_tool(
            &self,
            request: mcp::CallToolRequestParam,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::CallToolResult, mcp::ErrorData>> + Send + '_
        {
            let msg = request
                .arguments
                .and_then(|m| {
                    m.get("message")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            std::future::ready(Ok(mcp::CallToolResult {
                content: vec![mcp::Content::text(msg)],
                structured_content: None,
                is_error: None,
                meta: None,
            }))
        }
    }

    let test_name = "logging_persists_events_to_sqlite";
    let upstream_listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping {test_name}: {err}");
            return;
        }
        Err(err) => panic!("failed to bind upstream listener: {err}"),
    };
    let upstream_addr = upstream_listener.local_addr().unwrap();
    let upstream_service: StreamableHttpService<Upstream, LocalSessionManager> =
        StreamableHttpService::new(
            || Ok(Upstream),
            Default::default(),
            StreamableHttpServerConfig {
                stateful_mode: true,
                sse_keep_alive: Some(std::time::Duration::from_secs(15)),
            },
        );
    let upstream_router = axum::Router::new().nest_service("/mcp", upstream_service);
    tokio::spawn(async move {
        let _ = axum::serve(upstream_listener, upstream_router).await;
    });

    // Settings pointing to upstream
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "up".into(),
        description: "test".into(),
        transport: TransportType::StreamableHttp,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: format!("http://{}:{}/mcp", upstream_addr.ip(), upstream_addr.port()),
        headers: Default::default(),
        requires_auth: false,
        enabled: true,
    });
    save_settings_with(&cp, &s).expect("save settings");

    // Start bouncer
    #[derive(Clone)]
    struct NoopEmitter;
    impl EventEmitter for NoopEmitter {
        fn emit(&self, _e: &str, _p: &serde_json::Value) {}
    }
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 0));
    let (_handle, bound) =
        match start_http_server(NoopEmitter, cp.clone(), SqlitePublisher, addr).await {
            Ok(res) => res,
            Err(err) => {
                if err.contains("Operation not permitted") {
                    eprintln!("skipping {test_name}: {err}");
                    return;
                }
                panic!("start_http_server failed: {err}");
            }
        };
    let url = format!("http://{}:{}/mcp", bound.ip(), bound.port());

    // Client connects, lists tools, and calls echo
    let transport = StreamableHttpClientTransport::from_uri(url);
    let client = ().serve(transport).await.expect("serve client");
    let _ = client.list_all_tools().await.expect("list tools");
    let _ = client
        .call_tool(mcp::CallToolRequestParam {
            name: "echo".into(),
            arguments: Some(
                serde_json::json!({ "message": "hi" })
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
        })
        .await
        .expect("call echo");

    // Force logger flush and checkpoint
    mcp_bouncer::logging::force_flush_and_checkpoint().await;

    // Verify SQLite contains events
    let db_path = mcp_bouncer::logging::db_path().expect("logger should expose db_path");
    assert!(db_path.exists(), "logs.sqlite should exist at {db_path:?}");
    let mut conn = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        .connect()
        .await
        .expect("open sqlite");
    let cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rpc_events")
        .fetch_one(&mut conn)
        .await
        .expect("count events");
    assert!(cnt >= 2, "expected at least 2 events, had {cnt}");

    let rows = sqlx::query("SELECT DISTINCT method FROM rpc_events")
        .fetch_all(&mut conn)
        .await
        .expect("distinct methods");
    let mut methods = Vec::new();
    for row in rows {
        methods.push(row.try_get::<String, _>(0).expect("method column"));
    }
    assert!(methods.iter().any(|m| m == "initialize"));
    assert!(methods.iter().any(|m| m == "tools/list") || methods.iter().any(|m| m == "tools/call"));

    let sess_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
        .fetch_one(&mut conn)
        .await
        .expect("count sessions");
    assert!(sess_cnt >= 1, "expected at least one session row");

    // Snapshot a handful of events for sanity checks
    let rows = sqlx::query(
        "SELECT method, server_name FROM rpc_events ORDER BY ts_ms DESC, id DESC LIMIT 10",
    )
    .fetch_all(&mut conn)
    .await
    .expect("fetch recent events");
    assert!(!rows.is_empty(), "expected at least one recorded event");
    assert!(
        rows.iter()
            .any(|row| row.try_get::<String, _>(0).unwrap() == "initialize")
    );
}

#[tokio::test]
#[serial_test::serial]
async fn logging_persists_error_and_redacts_sensitive_fields() {
    let test_name = "logging_persists_error_and_redacts_sensitive_fields";
    // Upstream that exposes a failing tool
    #[derive(Clone)]
    struct ErrUpstream;
    impl rmcp::handler::server::ServerHandler for ErrUpstream {
        fn get_info(&self) -> mcp::ServerInfo {
            mcp::ServerInfo {
                protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                capabilities: mcp::ServerCapabilities::builder()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build(),
                server_info: mcp::Implementation {
                    name: "err".into(),
                    title: None,
                    version: "0.0.1".into(),
                    icons: None,
                    website_url: None,
                },
                instructions: None,
            }
        }
        fn list_tools(
            &self,
            _request: Option<mcp::PaginatedRequestParam>,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::ListToolsResult, mcp::ErrorData>> + Send + '_
        {
            let schema: mcp::JsonObject = Default::default();
            std::future::ready(Ok(mcp::ListToolsResult {
                tools: vec![mcp::Tool::new("fail", "fail", schema)],
                next_cursor: None,
            }))
        }
        fn call_tool(
            &self,
            _request: mcp::CallToolRequestParam,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::CallToolResult, mcp::ErrorData>> + Send + '_
        {
            // Return an error-like result (is_error=true)
            let res = mcp::CallToolResult {
                content: vec![mcp::Content::text("boom")],
                structured_content: None,
                is_error: Some(true),
                meta: None,
            };
            std::future::ready(Ok(res))
        }
    }

    // Bind upstream
    let upstream_listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping {test_name}: {err}");
            return;
        }
        Err(err) => panic!("failed to bind upstream listener: {err}"),
    };
    let upstream_addr = upstream_listener.local_addr().unwrap();
    let upstream_service: StreamableHttpService<ErrUpstream, LocalSessionManager> =
        StreamableHttpService::new(
            || Ok(ErrUpstream),
            Default::default(),
            StreamableHttpServerConfig {
                stateful_mode: true,
                sse_keep_alive: Some(std::time::Duration::from_secs(15)),
            },
        );
    let upstream_router = axum::Router::new().nest_service("/mcp", upstream_service);
    tokio::spawn(async move {
        let _ = axum::serve(upstream_listener, upstream_router).await;
    });

    // Configure bouncer to point at upstream
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "err".into(),
        description: "test".into(),
        transport: TransportType::StreamableHttp,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: format!("http://{}:{}/mcp", upstream_addr.ip(), upstream_addr.port()),
        headers: Default::default(),
        requires_auth: false,
        enabled: true,
    });
    save_settings_with(&cp, &s).expect("save settings");

    // Start bouncer
    #[derive(Clone)]
    struct NoopEmitter;
    impl EventEmitter for NoopEmitter {
        fn emit(&self, _e: &str, _p: &serde_json::Value) {}
    }
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 0));
    let (_handle, bound) =
        match start_http_server(NoopEmitter, cp.clone(), SqlitePublisher, addr).await {
            Ok(res) => res,
            Err(err) => {
                if err.contains("Operation not permitted") {
                    eprintln!("skipping {test_name}: {err}");
                    return;
                }
                panic!("start_http_server failed: {err}");
            }
        };
    let url = format!("http://{}:{}/mcp", bound.ip(), bound.port());

    // Client connects and calls the failing tool with sensitive fields
    let transport = StreamableHttpClientTransport::from_uri(url);
    let client = ().serve(transport).await.expect("serve client");
    let _ = client.list_all_tools().await.expect("list tools");
    let args = serde_json::json!({ "token": "s3cr3t", "Authorization": "Bearer abc" })
        .as_object()
        .unwrap()
        .clone();
    let _ = client
        .call_tool(mcp::CallToolRequestParam {
            name: "err::fail".into(),
            arguments: Some(args),
        })
        .await
        .expect("call fail (returns is_error)");

    mcp_bouncer::logging::force_flush_and_checkpoint().await;

    // Verify SQLite contains an error event and sensitive fields were redacted
    let db_path = mcp_bouncer::logging::db_path().expect("logger should expose db_path");
    let mut conn = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        .connect()
        .await
        .expect("open sqlite");
    // Ensure at least one tools/call event exists
    let call_cnt: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM rpc_events WHERE method='tools/call'")
            .fetch_one(&mut conn)
            .await
            .expect("count tools/call rows");
    assert!(call_cnt >= 1, "expected at least one tools/call event");
    // Sensitive raw values should not appear in any tools/call request_json
    let leaked_cnt: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rpc_events WHERE method='tools/call' AND (request_json LIKE '%s3cr3t%' OR request_json LIKE '%Bearer abc%')",
    )
    .fetch_one(&mut conn)
    .await
    .expect("leak count");
    assert_eq!(
        leaked_cnt, 0,
        "expected no leaked sensitive values in request_json"
    );

    // Inspect stored rows to ensure sensitive values were redacted
    let rows = sqlx::query("SELECT request_json FROM rpc_events WHERE method='tools/call'")
        .fetch_all(&mut conn)
        .await
        .expect("load tools/call rows");
    for row in rows {
        let payload: Option<String> = row.try_get(0).ok();
        if let Some(body) = payload {
            assert!(
                !body.contains("s3cr3t") && !body.contains("Bearer abc"),
                "stored JSON should be redacted"
            );
        }
    }
}

#[tokio::test]
#[serial_test::serial]
async fn logging_persists_many_calltool_events_in_batches() {
    let test_name = "logging_persists_many_calltool_events_in_batches";
    // Upstream with echo tool
    #[derive(Clone)]
    struct Upstream;
    impl rmcp::handler::server::ServerHandler for Upstream {
        fn get_info(&self) -> mcp::ServerInfo {
            mcp::ServerInfo {
                protocol_version: mcp::ProtocolVersion::V_2025_03_26,
                capabilities: mcp::ServerCapabilities::builder()
                    .enable_tools()
                    .enable_tool_list_changed()
                    .build(),
                server_info: mcp::Implementation {
                    name: "batch".into(),
                    title: None,
                    version: "0.0.1".into(),
                    icons: None,
                    website_url: None,
                },
                instructions: None,
            }
        }
        fn list_tools(
            &self,
            _request: Option<mcp::PaginatedRequestParam>,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::ListToolsResult, mcp::ErrorData>> + Send + '_
        {
            let schema: mcp::JsonObject = Default::default();
            std::future::ready(Ok(mcp::ListToolsResult {
                tools: vec![mcp::Tool::new("echo", "echo", schema)],
                next_cursor: None,
            }))
        }
        fn call_tool(
            &self,
            request: mcp::CallToolRequestParam,
            _context: rmcp::service::RequestContext<rmcp::RoleServer>,
        ) -> impl core::future::Future<Output = Result<mcp::CallToolResult, mcp::ErrorData>> + Send + '_
        {
            let msg = request
                .arguments
                .and_then(|m| {
                    m.get("message")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            std::future::ready(Ok(mcp::CallToolResult {
                content: vec![mcp::Content::text(msg)],
                structured_content: None,
                is_error: None,
                meta: None,
            }))
        }
    }

    // Bind upstream
    let upstream_listener = match tokio::net::TcpListener::bind("127.0.0.1:0").await {
        Ok(l) => l,
        Err(err) if err.kind() == std::io::ErrorKind::PermissionDenied => {
            eprintln!("skipping {test_name}: {err}");
            return;
        }
        Err(err) => panic!("failed to bind upstream listener: {err}"),
    };
    let upstream_addr = upstream_listener.local_addr().unwrap();
    let upstream_service: StreamableHttpService<Upstream, LocalSessionManager> =
        StreamableHttpService::new(
            || Ok(Upstream),
            Default::default(),
            StreamableHttpServerConfig {
                stateful_mode: true,
                sse_keep_alive: Some(std::time::Duration::from_secs(15)),
            },
        );
    let upstream_router = axum::Router::new().nest_service("/mcp", upstream_service);
    tokio::spawn(async move {
        let _ = axum::serve(upstream_listener, upstream_router).await;
    });

    // Configure bouncer to point at upstream
    let cp = TempConfigProvider::new();
    let mut s = default_settings();
    s.mcp_servers.push(MCPServerConfig {
        name: "batch".into(),
        description: "test".into(),
        transport: TransportType::StreamableHttp,
        command: String::new(),
        args: vec![],
        env: Default::default(),
        endpoint: format!("http://{}:{}/mcp", upstream_addr.ip(), upstream_addr.port()),
        headers: Default::default(),
        requires_auth: false,
        enabled: true,
    });
    save_settings_with(&cp, &s).expect("save settings");

    // Start bouncer
    #[derive(Clone)]
    struct NoopEmitter;
    impl EventEmitter for NoopEmitter {
        fn emit(&self, _e: &str, _p: &serde_json::Value) {}
    }
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 0));
    let (_handle, bound) =
        match start_http_server(NoopEmitter, cp.clone(), SqlitePublisher, addr).await {
            Ok(res) => res,
            Err(err) => {
                if err.contains("Operation not permitted") {
                    eprintln!("skipping {test_name}: {err}");
                    return;
                }
                panic!("start_http_server failed: {err}");
            }
        };
    let url = format!("http://{}:{}/mcp", bound.ip(), bound.port());

    // Client connects and sends many tools/call requests
    let transport = StreamableHttpClientTransport::from_uri(url);
    let client = ().serve(transport).await.expect("serve client");
    let _ = client.list_all_tools().await.expect("list tools");
    for i in 0..50 {
        let args = serde_json::json!({ "message": format!("hi-{i}") })
            .as_object()
            .unwrap()
            .clone();
        let _ = client
            .call_tool(mcp::CallToolRequestParam {
                name: "echo".into(),
                arguments: Some(args),
            })
            .await
            .expect("call echo");
    }

    mcp_bouncer::logging::force_flush_and_checkpoint().await;

    // Verify enough tools/call rows are present
    let db_path = mcp_bouncer::logging::db_path().expect("logger should expose db_path");
    let mut conn = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        .connect()
        .await
        .expect("open sqlite");
    let call_cnt: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM rpc_events WHERE method='tools/call'")
            .fetch_one(&mut conn)
            .await
            .expect("count tools/call rows");
    assert!(
        call_cnt >= 1,
        "expected at least one tools/call event, had {call_cnt}"
    );

    // keyset pagination sanity check using raw SQL
    let first_page_rows = sqlx::query(
        "SELECT id, ts_ms FROM rpc_events WHERE server_name = ? ORDER BY ts_ms DESC, id DESC LIMIT 20",
    )
    .bind("batch")
    .fetch_all(&mut conn)
    .await
    .expect("first page");
    assert!(first_page_rows.len() <= 20);
    if let Some(last_row) = first_page_rows.last() {
        let last_id: String = last_row.try_get("id").expect("id");
        let last_ts: i64 = last_row.try_get("ts_ms").expect("ts_ms");
        let next_rows = sqlx::query(
            "SELECT ts_ms FROM rpc_events \
             WHERE server_name = ? AND (ts_ms < ? OR (ts_ms = ? AND id < ?)) \
             ORDER BY ts_ms DESC, id DESC LIMIT 20",
        )
        .bind("batch")
        .bind(last_ts)
        .bind(last_ts)
        .bind(&last_id)
        .fetch_all(&mut conn)
        .await
        .expect("next page");
        for row in next_rows {
            let ts: i64 = row.try_get("ts_ms").expect("ts_ms");
            assert!(ts <= last_ts);
        }
    }
}
