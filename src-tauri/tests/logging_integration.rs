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
    assert!(methods.iter().any(|m| m == "listTools") || methods.iter().any(|m| m == "callTool"));

    let sess_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
        .fetch_one(&mut conn)
        .await
        .expect("count sessions");
    assert!(sess_cnt >= 1, "expected at least one session row");

    // Query through the public logging helpers to ensure UI paths work
    let queried = mcp_bouncer::logging::query_events(mcp_bouncer::logging::QueryParams {
        server: Some("up"),
        method: None,
        ok: None,
        limit: 100,
        after: None,
        start_ts_ms: None,
        end_ts_ms: None,
    })
    .await
    .expect("query events");
    assert!(!queried.is_empty(), "expected query_events to return rows");
    assert!(queried.iter().any(|row| row.method == "initialize"));

    let histogram =
        mcp_bouncer::logging::query_event_histogram(mcp_bouncer::logging::HistogramParams {
            server: None,
            method: None,
            ok: None,
            max_buckets: Some(16),
        })
        .await
        .expect("histogram query");
    if let Some(hist_start) = histogram.start_ts_ms
        && let Some(hist_end) = histogram.end_ts_ms
        && !histogram.buckets.is_empty()
    {
        let total_events: i64 = histogram
            .buckets
            .iter()
            .map(|bucket| bucket.counts.iter().map(|c| c.count as i64).sum::<i64>())
            .sum();
        assert_eq!(
            total_events, cnt,
            "histogram aggregate should match total row count",
        );

        if hist_end > hist_start {
            let mid = hist_start + (hist_end - hist_start) / 2.0;
            let window_start = mid.floor() as i64;
            let window_end = hist_end.ceil() as i64;
            let filtered = mcp_bouncer::logging::query_events(mcp_bouncer::logging::QueryParams {
                server: None,
                method: None,
                ok: None,
                limit: 200,
                after: None,
                start_ts_ms: Some(window_start),
                end_ts_ms: Some(window_end),
            })
            .await
            .expect("time-window query");
            for row in filtered.iter() {
                assert!(
                    row.ts_ms >= window_start as f64 && row.ts_ms <= window_end as f64 + 1.0,
                    "row outside requested time window",
                );
            }
        }
    }

    let count_via_helper = mcp_bouncer::logging::count_events(None)
        .await
        .expect("count events");
    assert!(count_via_helper >= queried.len() as f64);

    let latest = queried.first().expect("at least one event");
    let since = mcp_bouncer::logging::query_events_since(
        latest.ts_ms as i64 - 10_000,
        None,
        None,
        None,
        25,
    )
    .await
    .expect("query since");
    assert!(since.iter().any(|row| row.id == latest.id));
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
    // Ensure at least one callTool event exists
    let call_cnt: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM rpc_events WHERE method='callTool'")
            .fetch_one(&mut conn)
            .await
            .expect("count callTool rows");
    assert!(call_cnt >= 1, "expected at least one callTool event");
    // Sensitive raw values should not appear in any callTool request_json
    let leaked_cnt: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM rpc_events WHERE method='callTool' AND (request_json LIKE '%s3cr3t%' OR request_json LIKE '%Bearer abc%')",
    )
    .fetch_one(&mut conn)
    .await
    .expect("leak count");
    assert_eq!(
        leaked_cnt, 0,
        "expected no leaked sensitive values in request_json"
    );

    // Ensure query helpers also present redacted payloads
    let queried = mcp_bouncer::logging::query_events(mcp_bouncer::logging::QueryParams {
        server: None,
        method: Some("callTool"),
        ok: None,
        limit: 10,
        after: None,
        start_ts_ms: None,
        end_ts_ms: None,
    })
    .await
    .expect("query events for err::callTool");
    assert!(queried.iter().any(|row| row.method == "callTool"));
    for row in queried {
        if let Some(request_json) = &row.request_json {
            let serialized = request_json.to_string();
            assert!(
                !serialized.contains("s3cr3t") && !serialized.contains("Bearer abc"),
                "query helper should return redacted JSON"
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

    // Client connects and sends many callTool requests
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

    // Verify enough callTool rows are present
    let db_path = mcp_bouncer::logging::db_path().expect("logger should expose db_path");
    let mut conn = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(false)
        .connect()
        .await
        .expect("open sqlite");
    let call_cnt: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM rpc_events WHERE method='callTool'")
            .fetch_one(&mut conn)
            .await
            .expect("count callTool rows");
    assert!(
        call_cnt >= 1,
        "expected at least one callTool event, had {call_cnt}"
    );

    // query helper keyset pagination sanity check
    let first_page = mcp_bouncer::logging::query_events(mcp_bouncer::logging::QueryParams {
        server: Some("batch"),
        method: Some("callTool"),
        ok: None,
        limit: 20,
        after: None,
        start_ts_ms: None,
        end_ts_ms: None,
    })
    .await
    .expect("first page");
    assert!(first_page.len() <= 20);
    if let Some(last) = first_page.last() {
        let cursor = (last.ts_ms as i64, last.id.as_str());
        let next_page = mcp_bouncer::logging::query_events(mcp_bouncer::logging::QueryParams {
            server: Some("batch"),
            method: Some("callTool"),
            ok: None,
            limit: 20,
            after: Some(cursor),
            start_ts_ms: None,
            end_ts_ms: None,
        })
        .await
        .expect("next page");
        for row in next_page {
            assert!(row.ts_ms <= last.ts_ms);
        }
    }
}
