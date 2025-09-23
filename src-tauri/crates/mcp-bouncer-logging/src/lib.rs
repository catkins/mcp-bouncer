use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use rusqlite::{Connection as SqliteConn, params, params_from_iter, ToSql};
use mcp_bouncer_core::config::{ConfigProvider, OsConfigProvider, Settings};
use mcp_bouncer_core::events::{EventEmitter, logs_rpc_event};
use mcp_bouncer_core::logging::{Event, RpcEventPublisher};
use serde_json::Value as JsonValue;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Duration, Instant, timeout};

#[derive(Clone)]
pub struct LoggerCfg {
    pub enabled: bool,
    pub db_path: PathBuf,
    pub redact_keys: Vec<String>, // lowercased
}

static LOGGER: OnceLock<LoggerHandle> = OnceLock::new();

enum Msg {
    Event(Box<Event>),
    Flush(oneshot::Sender<()>),
}

#[derive(Clone)]
pub struct LoggerHandle {
    tx: mpsc::Sender<Msg>,
    pub cfg: Arc<LoggerCfg>,
}

#[derive(Clone, Default)]
pub struct SqlitePublisher;

impl RpcEventPublisher for SqlitePublisher {
    fn init_with(&self, cp: &dyn ConfigProvider, settings: &Settings) {
        init_once_with(cp, settings);
    }

    fn log(&self, event: Event) {
        log_rpc_event(event);
    }

    fn log_and_emit<E: EventEmitter>(&self, emitter: &E, event: Event) {
        let cloned = event.clone();
        log_rpc_event(event);
        logs_rpc_event(emitter, &cloned);
    }
}

// Expose current DB path for tests and diagnostics
pub fn db_path() -> Option<PathBuf> {
    LOGGER.get().map(|h| h.cfg.db_path.clone())
}

pub fn init_once_with(cp: &dyn ConfigProvider, _settings: &Settings) {
    // Always-on logging: ignore app settings and create DB at default location.
    let enabled = true;
    let db_path = default_db_path(cp);
    let redact_keys: Vec<String> = default_redact_list();
    let cfg = LoggerCfg {
        enabled,
        db_path: db_path.clone(),
        redact_keys,
    };
    let (tx, rx) = mpsc::channel::<Msg>(8_192);
    let handle = LoggerHandle {
        tx,
        cfg: Arc::new(cfg),
    };
    if LOGGER.set(handle.clone()).is_ok() {
        // Spawn background writer
        tokio::spawn(async move { writer_task(handle.cfg.clone(), rx).await });
    }
}

pub fn init_once() {
    let settings = mcp_bouncer_core::config::load_settings();
    init_once_with(&OsConfigProvider, &settings);
}

pub fn log_rpc_event(mut evt: Event) {
    if let Some(handle) = LOGGER.get()
        && handle.cfg.enabled
    {
        // Redact before sending
        evt.request_json = evt
            .request_json
            .map(|v| redact_json(v, &handle.cfg.redact_keys));
        evt.response_json = evt
            .response_json
            .map(|v| redact_json(v, &handle.cfg.redact_keys));
        let _ = handle.tx.try_send(Msg::Event(Box::new(evt)));
    }
}

pub async fn force_flush_and_checkpoint() {
    if let Some(handle) = LOGGER.get() {
        let (tx_done, rx_done) = oneshot::channel();
        let _ = handle.tx.send(Msg::Flush(tx_done)).await;
        let _ = tokio::time::timeout(Duration::from_secs(2), rx_done).await;
    }
}

async fn writer_task(cfg: Arc<LoggerCfg>, mut rx: mpsc::Receiver<Msg>) {
    {
        if let Some(parent) = cfg.db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut conn = match SqliteConn::open(&cfg.db_path) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(target = "logging", path=%cfg.db_path.display(), error=%e, "open_failed");
                return;
            }
        };
        if let Err(e) = configure_connection(&mut conn) {
            tracing::error!(target = "logging", error=%e, "configure_failed");
            return;
        }
        if let Err(e) = create_schema(&conn) {
            tracing::error!(target = "logging", error=%e, "schema_failed");
            return;
        }

        let mut buf: Vec<Event> = Vec::with_capacity(512);
        let mut last = Instant::now();
        let mut last_checkpoint = Instant::now();
        let mut maybe_checkpoint = |conn: &mut SqliteConn| {
            if last_checkpoint.elapsed() >= Duration::from_secs(1) {
                let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []);
                last_checkpoint = Instant::now();
            }
        };
        loop {
            let deadline = Duration::from_millis(250);
            match timeout(deadline, rx.recv()).await {
                // Received a message
                Ok(Some(Msg::Event(e))) => {
                    buf.push(*e);
                    if buf.len() >= 256 || last.elapsed() >= deadline {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                        }
                        buf.clear();
                        last = Instant::now();
                        maybe_checkpoint(&mut conn);
                    }
                }
                Ok(Some(Msg::Flush(done))) => {
                    if !buf.is_empty() {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                        }
                        buf.clear();
                    }
                    // Force a checkpoint so WAL is applied
                    let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []);
                    let _ = done.send(());
                    last = Instant::now();
                    continue;
                }
                // Channel closed: flush any pending and exit
                Ok(None) => {
                    if !buf.is_empty() {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "final_flush_failed");
                        }
                        let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", []);
                    }
                    break;
                }
                // Idle timeout: flush if we have pending items, then continue
                Err(_) => {
                    if !buf.is_empty() {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                        }
                        buf.clear();
                    }
                    last = Instant::now();
                    maybe_checkpoint(&mut conn);
                    continue;
                }
            }
        }
    }
}

fn configure_connection(conn: &mut SqliteConn) -> rusqlite::Result<()> {
    let _ = conn.execute("PRAGMA journal_mode=WAL", []);
    let _ = conn.execute("PRAGMA synchronous=NORMAL", []);
    Ok(())
}

fn create_schema(conn: &SqliteConn) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            created_at_ms INTEGER NOT NULL,
            client_name TEXT,
            client_version TEXT,
            client_protocol TEXT,
            last_seen_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rpc_events (
            id TEXT PRIMARY KEY,
            ts_ms INTEGER NOT NULL,
            session_id TEXT REFERENCES sessions(session_id),
            method TEXT NOT NULL,
            server_name TEXT,
            server_version TEXT,
            server_protocol TEXT,
            duration_ms INTEGER,
            ok INTEGER NOT NULL,
            error TEXT,
            request_json TEXT,
            response_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_events_ts ON rpc_events(ts_ms);
        CREATE INDEX IF NOT EXISTS idx_events_session ON rpc_events(session_id);
        "#,
    )
}

fn flush_events(conn: &mut SqliteConn, events: &[Event]) -> rusqlite::Result<()> {
    if events.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    {
        let mut upsert_session = tx.prepare(
            "INSERT INTO sessions(session_id, created_at_ms, client_name, client_version, client_protocol, last_seen_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(session_id) DO UPDATE SET
                 client_name = excluded.client_name,
                 client_version = excluded.client_version,
                 client_protocol = excluded.client_protocol,
                 last_seen_at_ms = excluded.last_seen_at_ms"
        )?;
        let mut insert_event = tx.prepare(
            "INSERT INTO rpc_events(id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
        )?;

        for e in events {
            let created_at_ms = e.ts_ms;
            let last_seen_ms = e.ts_ms;
            let _ = upsert_session.execute(params![
                &e.session_id,
                created_at_ms,
                e.client_name.as_deref(),
                e.client_version.as_deref(),
                e.client_protocol.as_deref(),
                last_seen_ms,
            ]);

            let request_json = e
                .request_json
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default());
            let response_json = e
                .response_json
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default());
            insert_event.execute(params![
                e.id.to_string(),
                e.ts_ms,
                &e.session_id,
                &e.method,
                e.server_name.as_deref(),
                e.server_version.as_deref(),
                e.server_protocol.as_deref(),
                e.duration_ms,
                e.ok,
                e.error.as_deref(),
                request_json.as_deref(),
                response_json.as_deref(),
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn default_db_path(cp: &dyn ConfigProvider) -> PathBuf {
    cp.base_dir().join("logs.sqlite")
}

fn default_redact_list() -> Vec<String> {
    vec![
        "authorization".into(),
        "token".into(),
        "password".into(),
        "secret".into(),
        "api_key".into(),
        "access_token".into(),
    ]
}

pub fn redact_json(mut v: JsonValue, keys_lc: &[String]) -> JsonValue {
    fn rec(v: &mut JsonValue, keys_lc: &[String]) {
        match v {
            JsonValue::Object(map) => {
                for (k, val) in map.iter_mut() {
                    if keys_lc.iter().any(|x| x == &k.to_lowercase()) {
                        *val = JsonValue::String("***".to_string());
                    } else {
                        rec(val, keys_lc);
                    }
                }
            }
            JsonValue::Array(arr) => {
                for item in arr.iter_mut() {
                    rec(item, keys_lc);
                }
            }
            _ => {}
        }
    }
    rec(&mut v, keys_lc);
    v
}

// ---------------- Query helpers for UI ----------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct EventRow {
    pub id: String,
    pub ts_ms: f64,
    pub session_id: String,
    pub method: String,
    pub server_name: Option<String>,
    pub server_version: Option<String>,
    pub server_protocol: Option<String>,
    pub duration_ms: Option<f64>,
    pub ok: bool,
    pub error: Option<String>,
    pub request_json: Option<JsonValue>,
    pub response_json: Option<JsonValue>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct HistogramCount {
    pub method: String,
    pub count: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct HistogramBucket {
    pub start_ts_ms: f64,
    pub end_ts_ms: f64,
    pub counts: Vec<HistogramCount>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct EventHistogram {
    pub start_ts_ms: Option<f64>,
    pub end_ts_ms: Option<f64>,
    pub bucket_width_ms: f64,
    pub buckets: Vec<HistogramBucket>,
}

pub struct QueryParams<'a> {
    pub server: Option<&'a str>,
    pub method: Option<&'a str>,
    pub ok: Option<bool>,
    pub limit: usize,
    pub after: Option<(i64, &'a str)>, // (ts_ms, id)
    pub start_ts_ms: Option<i64>,
    pub end_ts_ms: Option<i64>,
}

fn push_common_filters(
    where_clauses: &mut Vec<String>,
    binds: &mut Vec<Box<dyn ToSql>>,
    server: Option<&str>,
    method: Option<&str>,
    ok: Option<bool>,
) {
    if let Some(s) = server {
        where_clauses.push("server_name = ?".into());
        binds.push(Box::new(s.to_string()));
    }
    if let Some(m) = method {
        where_clauses.push("method = ?".into());
        binds.push(Box::new(m.to_string()));
    }
    if let Some(ok_flag) = ok {
        where_clauses.push("ok = ?".into());
        binds.push(Box::new(ok_flag));
    }
}

fn choose_bucket_width(range_ms: i64, max_buckets: usize) -> i64 {
    const CANDIDATES: [i64; 21] = [
        1,
        10,
        50,
        100,
        250,
        500,
        1_000,
        2_000,
        5_000,
        10_000,
        30_000,
        60_000,
        120_000,
        300_000,
        600_000,
        1_800_000,
        3_600_000,
        7_200_000,
        14_400_000,
        43_200_000,
        86_400_000,
    ];
    if range_ms <= 0 {
        return 1_000;
    }
    for width in CANDIDATES {
        let buckets = (range_ms / width) + 1;
        if buckets as usize <= max_buckets {
            return width.max(1);
        }
    }
    (range_ms / max_buckets as i64).max(1)
}

pub fn query_events(params: QueryParams) -> Result<Vec<EventRow>, String> {
    let Some(path) = db_path() else {
        return Ok(vec![]);
    };
    let conn = SqliteConn::open(path).map_err(|e| format!("open db: {e}"))?;
    // Build SQL with optional filters and keyset pagination (most recent first)
    let mut sql = String::from(
        "SELECT id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json FROM rpc_events",
    );
    let mut where_clauses: Vec<String> = Vec::new();
    let mut binds: Vec<Box<dyn ToSql>> = Vec::new();
    push_common_filters(&mut where_clauses, &mut binds, params.server, params.method, params.ok);
    if let Some(start) = params.start_ts_ms {
        where_clauses.push("ts_ms >= ?".into());
        binds.push(Box::new(start));
    }
    if let Some(end) = params.end_ts_ms {
        where_clauses.push("ts_ms <= ?".into());
        binds.push(Box::new(end));
    }
    if let Some((ts_ms, id)) = params.after {
        // keyset: (ts,id) < (after.ts, after.id) for DESC order
        where_clauses.push(
            "(ts_ms < ? OR (ts_ms = ? AND id < ?))"
                .into(),
        );
        binds.push(Box::new(ts_ms));
        binds.push(Box::new(ts_ms));
        binds.push(Box::new(id.to_string()));
    }
    if !where_clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&where_clauses.join(" AND "));
    }
    sql.push_str(" ORDER BY ts_ms DESC, id DESC LIMIT ?");
    let limit = if params.limit == 0 {
        50
    } else {
        params.limit.min(200)
    } as i64;
    binds.push(Box::new(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(
            params_from_iter(binds.iter().map(|b| &**b as &dyn ToSql)),
            |row| {
                let id: String = row.get(0)?;
                let ts_ms_raw: i64 = row.get(1)?;
                let session_id: String = row.get(2)?;
                let method: String = row.get(3)?;
                let server_name: Option<String> = row.get(4)?;
                let server_version: Option<String> = row.get(5)?;
                let server_protocol: Option<String> = row.get(6)?;
                let duration_ms_raw: Option<i64> = row.get(7)?;
                let ok: bool = row.get(8)?;
                let error: Option<String> = row.get(9)?;
                let req_s: Option<String> = row.get(10)?;
                let res_s: Option<String> = row.get(11)?;
                let request_json = req_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let response_json = res_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let ts_ms = ts_ms_raw as f64;
                let duration_ms = duration_ms_raw.map(|val| val as f64);
                Ok(EventRow {
                    id,
                    ts_ms,
                    session_id,
                    method,
                    server_name,
                    server_version,
                    server_protocol,
                    duration_ms,
                    ok,
                    error,
                    request_json,
                    response_json,
                })
            },
        )
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub fn count_events(server: Option<&str>) -> Result<f64, String> {
    let Some(path) = db_path() else {
        return Ok(0.0);
    };
    let conn = SqliteConn::open(path).map_err(|e| format!("open db: {e}"))?;
    let mut sql = String::from("SELECT COUNT(*) FROM rpc_events");
    let mut binds: Vec<Box<dyn ToSql>> = Vec::new();
    if let Some(s) = server {
        sql.push_str(" WHERE server_name = ?");
        binds.push(Box::new(s.to_string()));
    }
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let cnt: i64 = stmt
        .query_row(
            params_from_iter(binds.iter().map(|b| &**b as &dyn ToSql)),
            |row| row.get(0),
        )
        .map_err(|e| format!("query: {e}"))?;
    Ok(cnt as f64)
}

pub fn query_events_since(
    since_ts_ms: i64,
    server: Option<&str>,
    method: Option<&str>,
    ok_flag: Option<bool>,
    limit: usize,
) -> Result<Vec<EventRow>, String> {
    let Some(path) = db_path() else {
        return Ok(vec![]);
    };
    let conn = SqliteConn::open(path).map_err(|e| format!("open db: {e}"))?;
    let mut sql = String::from(
        "SELECT id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json FROM rpc_events WHERE ts_ms > ?",
    );
    let mut binds: Vec<Box<dyn ToSql>> = vec![Box::new(since_ts_ms)];
    if let Some(s) = server {
        sql.push_str(" AND server_name = ?");
        binds.push(Box::new(s.to_string()));
    }
    if let Some(m) = method {
        sql.push_str(" AND method = ?");
        binds.push(Box::new(m.to_string()));
    }
    if let Some(ok) = ok_flag {
        sql.push_str(" AND ok = ?");
        binds.push(Box::new(ok));
    }
    sql.push_str(" ORDER BY ts_ms DESC, id DESC LIMIT ?");
    let limit = if limit == 0 { 50 } else { limit.min(200) } as i64;
    binds.push(Box::new(limit));
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(
            params_from_iter(binds.iter().map(|b| &**b as &dyn ToSql)),
            |row| {
                let id: String = row.get(0)?;
                let ts_ms_raw: i64 = row.get(1)?;
                let session_id: String = row.get(2)?;
                let method: String = row.get(3)?;
                let server_name: Option<String> = row.get(4)?;
                let server_version: Option<String> = row.get(5)?;
                let server_protocol: Option<String> = row.get(6)?;
                let duration_ms_raw: Option<i64> = row.get(7)?;
                let ok: bool = row.get(8)?;
                let error: Option<String> = row.get(9)?;
                let req_s: Option<String> = row.get(10)?;
                let res_s: Option<String> = row.get(11)?;
                let request_json = req_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let response_json = res_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let ts_ms = ts_ms_raw as f64;
                let duration_ms = duration_ms_raw.map(|val| val as f64);
                Ok(EventRow {
                    id,
                    ts_ms,
                    session_id,
                    method,
                    server_name,
                    server_version,
                    server_protocol,
                    duration_ms,
                    ok,
                    error,
                    request_json,
                    response_json,
                })
            },
        )
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

pub struct HistogramParams<'a> {
    pub server: Option<&'a str>,
    pub method: Option<&'a str>,
    pub ok: Option<bool>,
    pub max_buckets: Option<usize>,
}

pub fn query_event_histogram(params: HistogramParams) -> Result<EventHistogram, String> {
    let Some(path) = db_path() else {
        return Ok(EventHistogram {
            start_ts_ms: None,
            end_ts_ms: None,
            bucket_width_ms: 0.0,
            buckets: Vec::new(),
        });
    };
    let conn = SqliteConn::open(path).map_err(|e| format!("open db: {e}"))?;

    // Compute time bounds first.
    let mut range_sql = String::from("SELECT MIN(ts_ms), MAX(ts_ms) FROM rpc_events");
    let mut range_where: Vec<String> = Vec::new();
    let mut range_binds: Vec<Box<dyn ToSql>> = Vec::new();
    push_common_filters(
        &mut range_where,
        &mut range_binds,
        params.server,
        params.method,
        params.ok,
    );
    if !range_where.is_empty() {
        range_sql.push_str(" WHERE ");
        range_sql.push_str(&range_where.join(" AND "));
    }
    let mut range_stmt = conn
        .prepare(&range_sql)
        .map_err(|e| format!("prepare range: {e}"))?;
    let range_row = range_stmt
        .query_row(
            params_from_iter(range_binds.iter().map(|b| &**b as &dyn ToSql)),
            |row| {
                let min_ts: Option<i64> = row.get(0)?;
                let max_ts: Option<i64> = row.get(1)?
;
                Ok((min_ts, max_ts))
            },
        )
        .map_err(|e| format!("query range: {e}"))?;

    let (Some(min_ts), Some(max_ts)) = range_row else {
        return Ok(EventHistogram {
            start_ts_ms: None,
            end_ts_ms: None,
            bucket_width_ms: 0.0,
            buckets: Vec::new(),
        });
    };

    let range_ms = (max_ts - min_ts).max(0);
    let max_buckets = params.max_buckets.unwrap_or(80).max(1);
    let bucket_width = choose_bucket_width(range_ms, max_buckets);
    let bucket_width = bucket_width.max(1);

    let mut hist_sql = String::from(
        "SELECT ((ts_ms - ?) / ?) AS bucket_idx, method, COUNT(*) FROM rpc_events",
    );
    let mut hist_where: Vec<String> = Vec::new();
    let mut hist_binds: Vec<Box<dyn ToSql>> = vec![Box::new(min_ts), Box::new(bucket_width)];
    push_common_filters(
        &mut hist_where,
        &mut hist_binds,
        params.server,
        params.method,
        params.ok,
    );
    if !hist_where.is_empty() {
        hist_sql.push_str(" WHERE ");
        hist_sql.push_str(&hist_where.join(" AND "));
    }
    hist_sql.push_str(" GROUP BY bucket_idx, method ORDER BY bucket_idx ASC");

    let mut hist_stmt = conn
        .prepare(&hist_sql)
        .map_err(|e| format!("prepare histogram: {e}"))?;
    let rows = hist_stmt
        .query_map(
            params_from_iter(hist_binds.iter().map(|b| &**b as &dyn ToSql)),
            |row| {
                let bucket_idx: i64 = row.get(0)?;
                let method: String = row.get(1)?;
                let count: i64 = row.get(2)?;
                Ok((bucket_idx, method, count))
            },
        )
        .map_err(|e| format!("query histogram: {e}"))?;

    let mut cell_data: Vec<(i64, String, i64)> = Vec::new();
    let mut max_bucket_idx = 0i64;
    for row in rows {
        let (idx, method, count) = row.map_err(|e| format!("row histogram: {e}"))?;
        if idx >= 0 {
            if idx > max_bucket_idx {
                max_bucket_idx = idx;
            }
            cell_data.push((idx, method, count));
        }
    }

    let required_from_range = ((range_ms + bucket_width - 1) / bucket_width) + 1;
    let bucket_count = ((max_bucket_idx + 1).max(required_from_range)) as usize;
    let mut buckets: Vec<HistogramBucket> = (0..bucket_count)
        .map(|i| {
            let start = min_ts + (i as i64 * bucket_width);
            let end = start + bucket_width;
            HistogramBucket {
                start_ts_ms: start as f64,
                end_ts_ms: end as f64,
                counts: Vec::new(),
            }
        })
        .collect();

    for (idx, method, count) in cell_data {
        if let Some(bucket) = buckets.get_mut(idx as usize) {
            bucket.counts.push(HistogramCount {
                method,
                count: count as f64,
            });
        }
    }

    Ok(EventHistogram {
        start_ts_ms: Some(min_ts as f64),
        end_ts_ms: Some(max_ts as f64),
        bucket_width_ms: bucket_width as f64,
        buckets,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_masks_keys_recursively() {
        let v = serde_json::json!({
            "Authorization": "Bearer x",
            "nested": { "password": "p", "keep": 1 },
            "arr": [ {"token": "a"}, {"ok": true} ]
        });
        let out = redact_json(v, &default_redact_list());
        let s = out.to_string();
        assert!(s.contains("***"));
        assert!(!s.contains("Bearer x"));
        assert!(!s.contains("\"p\""));
        assert!(!s.contains("\"a\""));
        assert!(s.contains("\"keep\":1"));
    }
}
