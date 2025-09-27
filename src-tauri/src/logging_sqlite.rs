use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::config::{ConfigProvider, OsConfigProvider, Settings};
use crate::events::{EventEmitter, logs_rpc_event};
use crate::logging_core::{Event, RpcEventPublisher};
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::{ConnectOptions, Connection, Row, Sqlite, SqliteConnection};
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Duration, Instant, timeout};

const FLUSH_BATCH_SIZE: usize = 256;
const FLUSH_INTERVAL: Duration = Duration::from_millis(250);
const CHECKPOINT_INTERVAL: Duration = Duration::from_secs(1);

const MIGRATION_SQL: &str = include_str!("sql/migrations/0001_logging_init.sql");

#[derive(Clone)]
pub struct LoggerCfg {
    pub enabled: bool,
    pub db_path: PathBuf,
    pub redact_keys: Vec<String>, // lowercased
}

static LOGGER: OnceLock<Arc<Mutex<Option<LoggerHandle>>>> = OnceLock::new();

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
    let mutex = LOGGER.get_or_init(|| Arc::new(Mutex::new(None)));
    let guard = mutex.lock().unwrap();
    guard.as_ref().map(|h| h.cfg.db_path.clone())
}

pub fn init_once_with(cp: &dyn ConfigProvider, _settings: &Settings) {
    let mutex = LOGGER.get_or_init(|| Arc::new(Mutex::new(None)));
    let mut guard = mutex.lock().unwrap();

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

    let task_cfg = handle.cfg.clone();
    tokio::spawn(async move {
        writer_task(task_cfg, rx).await;
    });

    *guard = Some(handle);
}

pub fn init_once() {
    let settings = crate::config::load_settings();
    init_once_with(&OsConfigProvider, &settings);
}

pub fn log_rpc_event(mut evt: Event) {
    let mutex = LOGGER.get_or_init(|| Arc::new(Mutex::new(None)));
    let guard = mutex.lock().unwrap();

    if let Some(handle) = guard.as_ref()
        && handle.cfg.enabled
    {
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
    let mutex = LOGGER.get_or_init(|| Arc::new(Mutex::new(None)));
    let handle = {
        let guard = mutex.lock().unwrap();
        guard.as_ref().cloned()
    };

    if let Some(handle) = handle {
        let (tx_done, rx_done) = oneshot::channel();
        let _ = handle.tx.send(Msg::Flush(tx_done)).await;
        let _ = tokio::time::timeout(Duration::from_secs(2), rx_done).await;
    }
}

async fn writer_task(cfg: Arc<LoggerCfg>, mut rx: mpsc::Receiver<Msg>) {
    if let Some(parent) = cfg.db_path.parent()
        && let Err(e) = std::fs::create_dir_all(parent)
    {
        tracing::error!(
            target = "logging",
            path = %cfg.db_path.display(),
            error = %e,
            "create_dir_failed"
        );
        return;
    }

    let mut conn = match open_connection(&cfg).await {
        Ok(conn) => conn,
        Err(e) => {
            tracing::error!(target = "logging", path=%cfg.db_path.display(), error=%e, "open_failed");
            return;
        }
    };

    if let Err(e) = ensure_schema(&mut conn).await {
        tracing::error!(target = "logging", path=%cfg.db_path.display(), error=%e, "schema_failed");
        return;
    }

    let mut buf: Vec<Event> = Vec::with_capacity(FLUSH_BATCH_SIZE);
    let mut last_flush = Instant::now();
    let mut last_checkpoint = Instant::now();

    loop {
        match timeout(FLUSH_INTERVAL, rx.recv()).await {
            Ok(Some(Msg::Event(evt))) => {
                buf.push(*evt);
                if buf.len() >= FLUSH_BATCH_SIZE || last_flush.elapsed() >= FLUSH_INTERVAL {
                    if let Err(e) = flush_events(&mut conn, &buf).await {
                        tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                    }
                    buf.clear();
                    last_flush = Instant::now();
                    if last_checkpoint.elapsed() >= CHECKPOINT_INTERVAL {
                        if let Err(e) = checkpoint(&mut conn).await {
                            tracing::debug!(target = "logging", error=%e, "checkpoint_failed");
                        }
                        last_checkpoint = Instant::now();
                    }
                }
            }
            Ok(Some(Msg::Flush(done))) => {
                if !buf.is_empty() {
                    if let Err(e) = flush_events(&mut conn, &buf).await {
                        tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                    }
                    buf.clear();
                }
                if let Err(e) = checkpoint(&mut conn).await {
                    tracing::debug!(target = "logging", error=%e, "checkpoint_failed");
                }
                let _ = done.send(());
                last_flush = Instant::now();
                last_checkpoint = Instant::now();
            }
            Ok(None) => {
                if !buf.is_empty() {
                    if let Err(e) = flush_events(&mut conn, &buf).await {
                        tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                    }
                    buf.clear();
                }
                let _ = checkpoint(&mut conn).await;
                break;
            }
            Err(_) => {
                if !buf.is_empty() {
                    if let Err(e) = flush_events(&mut conn, &buf).await {
                        tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                    }
                    buf.clear();
                }
                last_flush = Instant::now();
                if last_checkpoint.elapsed() >= CHECKPOINT_INTERVAL {
                    if let Err(e) = checkpoint(&mut conn).await {
                        tracing::debug!(target = "logging", error=%e, "checkpoint_failed");
                    }
                    last_checkpoint = Instant::now();
                }
            }
        }
    }
}

async fn open_connection(cfg: &LoggerCfg) -> Result<SqliteConnection, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(&cfg.db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(1));
    let mut conn = options.connect().await?;
    sqlx::query("PRAGMA foreign_keys=ON")
        .execute(&mut conn)
        .await?;
    Ok(conn)
}

async fn ensure_schema(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    for stmt in migration_statements() {
        sqlx::query(stmt).execute(&mut *conn).await?;
    }
    Ok(())
}

async fn flush_events(conn: &mut SqliteConnection, events: &[Event]) -> Result<(), sqlx::Error> {
    if events.is_empty() {
        return Ok(());
    }
    let mut tx = conn.begin().await?;
    for event in events {
        let created_at_ms = event.ts_ms;
        let last_seen_ms = event.ts_ms;
        sqlx::query(
            "INSERT INTO sessions (session_id, created_at_ms, client_name, client_version, client_protocol, last_seen_at_ms)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(session_id) DO UPDATE SET
                 client_name = excluded.client_name,
                 client_version = excluded.client_version,
                 client_protocol = excluded.client_protocol,
                 last_seen_at_ms = excluded.last_seen_at_ms",
        )
        .bind(&event.session_id)
        .bind(created_at_ms)
        .bind(event.client_name.as_deref())
        .bind(event.client_version.as_deref())
        .bind(event.client_protocol.as_deref())
        .bind(last_seen_ms)
        .execute(&mut *tx)
        .await?;

        let request_json = event
            .request_json
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());
        let response_json = event
            .response_json
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());

        sqlx::query(
            "INSERT INTO rpc_events (id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(event.id.to_string())
        .bind(event.ts_ms)
        .bind(&event.session_id)
        .bind(&event.method)
        .bind(event.server_name.as_deref())
        .bind(event.server_version.as_deref())
        .bind(event.server_protocol.as_deref())
        .bind(event.duration_ms)
        .bind(event.ok)
        .bind(event.error.as_deref())
        .bind(request_json.as_deref())
        .bind(response_json.as_deref())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

async fn checkpoint(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&mut *conn)
        .await?
        .rows_affected();
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
    pub after: Option<(i64, &'a str)>,
    pub start_ts_ms: Option<i64>,
    pub end_ts_ms: Option<i64>,
}

pub struct HistogramParams<'a> {
    pub server: Option<&'a str>,
    pub method: Option<&'a str>,
    pub ok: Option<bool>,
    pub max_buckets: Option<usize>,
}

pub async fn query_events(params: QueryParams<'_>) -> Result<Vec<EventRow>, String> {
    let Some(path) = db_path() else {
        return Ok(vec![]);
    };
    let mut conn = open_reader(&path).await?;

    let mut builder = sqlx::QueryBuilder::<Sqlite>::new(
        "SELECT id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json FROM rpc_events",
    );
    let mut has_clause = false;

    if let Some(server) = params.server {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("server_name = ");
            b.push_bind(server.to_string());
        });
    }
    if let Some(method) = params.method {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("method = ");
            b.push_bind(method.to_string());
        });
    }
    if let Some(ok_flag) = params.ok {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("ok = ");
            b.push_bind(ok_flag);
        });
    }
    if let Some(start) = params.start_ts_ms {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("ts_ms >= ");
            b.push_bind(start);
        });
    }
    if let Some(end) = params.end_ts_ms {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("ts_ms <= ");
            b.push_bind(end);
        });
    }
    if let Some((ts_ms, id)) = params.after {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("(ts_ms < ");
            b.push_bind(ts_ms);
            b.push(" OR (ts_ms = ");
            b.push_bind(ts_ms);
            b.push(" AND id < ");
            b.push_bind(id.to_string());
            b.push("))");
        });
    }

    builder.push(" ORDER BY ts_ms DESC, id DESC LIMIT ");
    let limit = if params.limit == 0 {
        50
    } else {
        params.limit.min(200)
    } as i64;
    builder.push_bind(limit);

    let query = builder.build();
    let rows = query
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("query events: {e}"))?;
    rows.into_iter()
        .map(map_event_row)
        .collect::<Result<Vec<_>, _>>()
}

pub async fn query_events_since(
    since_ts_ms: i64,
    server: Option<&str>,
    method: Option<&str>,
    ok_flag: Option<bool>,
    limit: usize,
) -> Result<Vec<EventRow>, String> {
    let Some(path) = db_path() else {
        return Ok(vec![]);
    };
    let mut conn = open_reader(&path).await?;
    let mut builder = sqlx::QueryBuilder::<Sqlite>::new(
        "SELECT id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json FROM rpc_events WHERE ts_ms > ",
    );
    builder.push_bind(since_ts_ms);
    if let Some(server) = server {
        builder.push(" AND server_name = ");
        builder.push_bind(server.to_string());
    }
    if let Some(method) = method {
        builder.push(" AND method = ");
        builder.push_bind(method.to_string());
    }
    if let Some(ok_flag) = ok_flag {
        builder.push(" AND ok = ");
        builder.push_bind(ok_flag);
    }
    builder.push(" ORDER BY ts_ms DESC, id DESC LIMIT ");
    let limit = if limit == 0 { 50 } else { limit.min(200) } as i64;
    builder.push_bind(limit);
    let rows = builder
        .build()
        .fetch_all(&mut conn)
        .await
        .map_err(|e| format!("query events since: {e}"))?;
    rows.into_iter()
        .map(map_event_row)
        .collect::<Result<Vec<_>, _>>()
}

pub async fn count_events(server: Option<&str>) -> Result<f64, String> {
    let Some(path) = db_path() else {
        return Ok(0.0);
    };
    let mut conn = open_reader(&path).await?;
    let mut builder = sqlx::QueryBuilder::<Sqlite>::new("SELECT COUNT(*) as count FROM rpc_events");
    let mut has_clause = false;
    if let Some(server) = server {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("server_name = ");
            b.push_bind(server.to_string());
        });
    }
    let row = builder
        .build()
        .fetch_one(&mut conn)
        .await
        .map_err(|e| format!("count events: {e}"))?;
    let count: i64 = row
        .try_get("count")
        .map_err(|e| format!("get count: {e}"))?;
    Ok(count as f64)
}

pub async fn query_event_histogram(params: HistogramParams<'_>) -> Result<EventHistogram, String> {
    let Some(path) = db_path() else {
        return Ok(EventHistogram {
            start_ts_ms: None,
            end_ts_ms: None,
            bucket_width_ms: 0.0,
            buckets: Vec::new(),
        });
    };
    let mut conn = open_reader(&path).await?;

    let (min_ts, max_ts) = match fetch_time_range(&mut conn, &params).await? {
        Some(range) => range,
        None => {
            return Ok(EventHistogram {
                start_ts_ms: None,
                end_ts_ms: None,
                bucket_width_ms: 0.0,
                buckets: Vec::new(),
            });
        }
    };

    let range_ms = (max_ts - min_ts).max(0);
    let max_buckets = params.max_buckets.unwrap_or(80).max(1);
    let bucket_width = choose_bucket_width(range_ms, max_buckets).max(1);

    let histogram_data = fetch_histogram_cells(&mut conn, &params, min_ts, bucket_width).await?;

    let required_from_range = ((range_ms + bucket_width - 1) / bucket_width) + 1;
    let bucket_count = ((histogram_data.max_bucket + 1).max(required_from_range)) as usize;
    let mut buckets: Vec<HistogramBucket> = (0..bucket_count)
        .map(|i| {
            let start = min_ts + (i as i64 * bucket_width);
            HistogramBucket {
                start_ts_ms: start as f64,
                end_ts_ms: (start + bucket_width) as f64,
                counts: Vec::new(),
            }
        })
        .collect();

    for cell in histogram_data.cells {
        if let Some(bucket) = buckets.get_mut(cell.bucket_idx as usize) {
            bucket.counts.push(HistogramCount {
                method: cell.method,
                count: cell.count as f64,
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

struct HistogramCells {
    cells: Vec<HistogramCell>,
    max_bucket: i64,
}

struct HistogramCell {
    bucket_idx: i64,
    method: String,
    count: i64,
}

async fn fetch_time_range(
    conn: &mut SqliteConnection,
    params: &HistogramParams<'_>,
) -> Result<Option<(i64, i64)>, String> {
    let mut builder = sqlx::QueryBuilder::<Sqlite>::new(
        "SELECT MIN(ts_ms) AS min_ts, MAX(ts_ms) AS max_ts FROM rpc_events",
    );
    let mut has_clause = false;
    if let Some(server) = params.server {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("server_name = ");
            b.push_bind(server.to_string());
        });
    }
    if let Some(method) = params.method {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("method = ");
            b.push_bind(method.to_string());
        });
    }
    if let Some(ok_flag) = params.ok {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("ok = ");
            b.push_bind(ok_flag);
        });
    }
    let row = builder
        .build()
        .fetch_one(conn)
        .await
        .map_err(|e| format!("time range: {e}"))?;
    let min_ts: Option<i64> = row.try_get("min_ts").map_err(|e| format!("min_ts: {e}"))?;
    let max_ts: Option<i64> = row.try_get("max_ts").map_err(|e| format!("max_ts: {e}"))?;
    match (min_ts, max_ts) {
        (Some(min), Some(max)) => Ok(Some((min, max))),
        _ => Ok(None),
    }
}

async fn fetch_histogram_cells(
    conn: &mut SqliteConnection,
    params: &HistogramParams<'_>,
    min_ts: i64,
    bucket_width: i64,
) -> Result<HistogramCells, String> {
    let mut builder = sqlx::QueryBuilder::<Sqlite>::new("SELECT ((ts_ms - ");
    builder.push_bind(min_ts);
    builder.push(") / ");
    builder.push_bind(bucket_width);
    builder.push(") AS bucket_idx, method, COUNT(*) AS count FROM rpc_events");

    let mut has_clause = false;
    if let Some(server) = params.server {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("server_name = ");
            b.push_bind(server.to_string());
        });
    }
    if let Some(method) = params.method {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("method = ");
            b.push_bind(method.to_string());
        });
    }
    if let Some(ok_flag) = params.ok {
        append_condition(&mut builder, &mut has_clause, |b| {
            b.push("ok = ");
            b.push_bind(ok_flag);
        });
    }
    builder.push(" GROUP BY bucket_idx, method ORDER BY bucket_idx ASC");

    let rows = builder
        .build()
        .fetch_all(conn)
        .await
        .map_err(|e| format!("histogram query: {e}"))?;

    let mut max_bucket = 0i64;
    let mut cells = Vec::new();
    for row in rows {
        let bucket_idx: i64 = row
            .try_get("bucket_idx")
            .map_err(|e| format!("bucket_idx: {e}"))?;
        let method: String = row.try_get("method").map_err(|e| format!("method: {e}"))?;
        let count: i64 = row.try_get("count").map_err(|e| format!("count: {e}"))?;
        if bucket_idx >= 0 {
            if bucket_idx > max_bucket {
                max_bucket = bucket_idx;
            }
            cells.push(HistogramCell {
                bucket_idx,
                method,
                count,
            });
        }
    }
    Ok(HistogramCells { cells, max_bucket })
}

fn choose_bucket_width(range_ms: i64, max_buckets: usize) -> i64 {
    const CANDIDATES: [i64; 21] = [
        1, 10, 50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000,
        600_000, 1_800_000, 3_600_000, 7_200_000, 14_400_000, 43_200_000, 86_400_000,
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

fn append_condition<F>(builder: &mut sqlx::QueryBuilder<Sqlite>, has_clause: &mut bool, mut f: F)
where
    F: FnMut(&mut sqlx::QueryBuilder<Sqlite>),
{
    if !*has_clause {
        builder.push(" WHERE ");
        *has_clause = true;
    } else {
        builder.push(" AND ");
    }
    f(builder);
}

fn migration_statements() -> impl Iterator<Item = &'static str> {
    MIGRATION_SQL
        .split(';')
        .map(str::trim)
        .filter(|stmt| !stmt.is_empty())
}

async fn open_reader(path: &Path) -> Result<SqliteConnection, String> {
    if let Some(parent) = path.parent()
        && let Err(e) = std::fs::create_dir_all(parent)
    {
        return Err(format!("create dir: {e}"));
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(1));
    options.connect().await.map_err(|e| format!("open db: {e}"))
}

fn map_event_row(row: sqlx::sqlite::SqliteRow) -> Result<EventRow, String> {
    let id: String = row.try_get("id").map_err(|e| format!("id: {e}"))?;
    let ts_ms_raw: i64 = row.try_get("ts_ms").map_err(|e| format!("ts_ms: {e}"))?;
    let session_id: String = row
        .try_get("session_id")
        .map_err(|e| format!("session_id: {e}"))?;
    let method: String = row.try_get("method").map_err(|e| format!("method: {e}"))?;
    let server_name: Option<String> = row
        .try_get("server_name")
        .map_err(|e| format!("server_name: {e}"))?;
    let server_version: Option<String> = row
        .try_get("server_version")
        .map_err(|e| format!("server_version: {e}"))?;
    let server_protocol: Option<String> = row
        .try_get("server_protocol")
        .map_err(|e| format!("server_protocol: {e}"))?;
    let duration_ms_raw: Option<i64> = row
        .try_get("duration_ms")
        .map_err(|e| format!("duration_ms: {e}"))?;
    let ok: bool = row.try_get("ok").map_err(|e| format!("ok: {e}"))?;
    let error: Option<String> = row.try_get("error").map_err(|e| format!("error: {e}"))?;
    let req_s: Option<String> = row
        .try_get("request_json")
        .map_err(|e| format!("request_json: {e}"))?;
    let res_s: Option<String> = row
        .try_get("response_json")
        .map_err(|e| format!("response_json: {e}"))?;
    let request_json = req_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
    let response_json = res_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
    let ts_ms = ts_ms_raw as f64;
    let duration_ms = duration_ms_raw.map(|v| v as f64);
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
}

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init_logging",
        sql: MIGRATION_SQL,
        kind: MigrationKind::Up,
    }]
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
