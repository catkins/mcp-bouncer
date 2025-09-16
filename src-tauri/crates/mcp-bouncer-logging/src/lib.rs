use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use duckdb::{Connection as DuckConn, params};
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
pub struct DuckDbPublisher;

impl RpcEventPublisher for DuckDbPublisher {
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
        let mut conn = match DuckConn::open(&cfg.db_path) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!(target = "logging", path=%cfg.db_path.display(), error=%e, "open_failed");
                return;
            }
        };
        if let Err(e) = create_schema(&conn) {
            tracing::error!(target = "logging", error=%e, "schema_failed");
            return;
        }

        let mut buf: Vec<Event> = Vec::with_capacity(512);
        let mut last = Instant::now();
        let mut last_checkpoint = Instant::now();
        let mut maybe_checkpoint = |conn: &mut DuckConn| {
            if last_checkpoint.elapsed() >= Duration::from_secs(1) {
                let _ = conn.execute("CHECKPOINT", []);
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
                    let _ = conn.execute("CHECKPOINT", []);
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
                        let _ = conn.execute("CHECKPOINT", []);
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

fn create_schema(conn: &DuckConn) -> duckdb::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            client_name TEXT,
            client_version TEXT,
            client_protocol TEXT,
            last_seen_at TIMESTAMP NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rpc_events (
            id UUID PRIMARY KEY,
            ts TIMESTAMP NOT NULL,
            session_id TEXT REFERENCES sessions(session_id),
            method TEXT NOT NULL,
            server_name TEXT,
            server_version TEXT,
            server_protocol TEXT,
            duration_ms BIGINT,
            ok BOOLEAN NOT NULL,
            error TEXT,
            request_json JSON,
            response_json JSON
        );
        CREATE INDEX IF NOT EXISTS idx_events_ts ON rpc_events(ts);
        CREATE INDEX IF NOT EXISTS idx_events_session ON rpc_events(session_id);
        "#,
    )
}

fn flush_events(conn: &mut DuckConn, events: &[Event]) -> duckdb::Result<()> {
    if events.is_empty() {
        return Ok(());
    }
    let tx = conn.transaction()?;
    {
        let mut up_sess = tx.prepare(
            "INSERT INTO sessions(session_id, created_at, client_name, client_version, client_protocol, last_seen_at)
             SELECT ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP
             WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE session_id = ?)"
        )?;
        let mut upd_seen = tx
            .prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?")?;
        let mut ins = tx.prepare(
            "INSERT INTO rpc_events(id, ts, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json)
             VALUES (?, TO_TIMESTAMP(?/1000.0), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )?;

        for e in events {
            // Ensure session row exists (create if missing), then bump last_seen
            let _ = up_sess.execute(params![
                &e.session_id,
                &e.client_name,
                &e.client_version,
                &e.client_protocol,
                &e.session_id,
            ]);
            let _ = upd_seen.execute(params![&e.session_id]);
            let req = e
                .request_json
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default());
            let res = e
                .response_json
                .as_ref()
                .map(|v| serde_json::to_string(v).unwrap_or_default());
            ins.execute(params![
                e.id,
                e.ts_ms,
                &e.session_id,
                &e.method,
                &e.server_name,
                &e.server_version,
                &e.server_protocol,
                e.duration_ms,
                e.ok,
                &e.error,
                &req,
                &res,
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn default_db_path(cp: &dyn ConfigProvider) -> PathBuf {
    cp.base_dir().join("logs.duckdb")
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
    pub ts_ms: i64,
    pub session_id: String,
    pub method: String,
    pub server_name: Option<String>,
    pub server_version: Option<String>,
    pub server_protocol: Option<String>,
    pub duration_ms: Option<i64>,
    pub ok: bool,
    pub error: Option<String>,
    pub request_json: Option<JsonValue>,
    pub response_json: Option<JsonValue>,
}

pub struct QueryParams<'a> {
    pub server: Option<&'a str>,
    pub method: Option<&'a str>,
    pub ok: Option<bool>,
    pub limit: usize,
    pub after: Option<(i64, &'a str)>, // (ts_ms, id)
}

pub fn query_events(params: QueryParams) -> Result<Vec<EventRow>, String> {
    let Some(path) = db_path() else {
        return Ok(vec![]);
    };
    let conn = DuckConn::open(path).map_err(|e| format!("open db: {e}"))?;
    // Build SQL with optional filters and keyset pagination (most recent first)
    let mut sql = String::from(
        "SELECT id::VARCHAR, CAST(epoch(ts) * 1000 AS BIGINT) AS ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, CAST(request_json AS VARCHAR), CAST(response_json AS VARCHAR) FROM rpc_events",
    );
    let mut where_clauses: Vec<String> = Vec::new();
    let mut binds: Vec<Box<dyn duckdb::ToSql>> = Vec::new();
    if let Some(s) = params.server {
        where_clauses.push("server_name = ?".into());
        binds.push(Box::new(s.to_string()));
    }
    if let Some(m) = params.method {
        where_clauses.push("method = ?".into());
        binds.push(Box::new(m.to_string()));
    }
    if let Some(ok) = params.ok {
        where_clauses.push("ok = ?".into());
        binds.push(Box::new(ok));
    }
    if let Some((ts_ms, id)) = params.after {
        // keyset: (ts,id) < (after.ts, after.id) for DESC order
        where_clauses.push(
            "(ts < TO_TIMESTAMP(?/1000.0) OR (ts = TO_TIMESTAMP(?/1000.0) AND id < ?::UUID))"
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
    sql.push_str(" ORDER BY ts DESC, id DESC LIMIT ?");
    let limit = if params.limit == 0 {
        50
    } else {
        params.limit.min(200)
    } as i64;
    binds.push(Box::new(limit));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(
            duckdb::params_from_iter(binds.iter().map(|b| &**b as &dyn duckdb::ToSql)),
            |row| {
                let id: String = row.get(0)?;
                let ts_ms: i64 = row.get(1)?;
                let session_id: String = row.get(2)?;
                let method: String = row.get(3)?;
                let server_name: Option<String> = row.get(4).ok();
                let server_version: Option<String> = row.get(5).ok();
                let server_protocol: Option<String> = row.get(6).ok();
                let duration_ms: Option<i64> = row.get(7).ok();
                let ok: bool = row.get(8)?;
                let error: Option<String> = row.get(9).ok();
                let req_s: Option<String> = row.get(10).ok();
                let res_s: Option<String> = row.get(11).ok();
                let request_json = req_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let response_json = res_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
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

pub fn count_events(server: Option<&str>) -> Result<i64, String> {
    let Some(path) = db_path() else {
        return Ok(0);
    };
    let conn = DuckConn::open(path).map_err(|e| format!("open db: {e}"))?;
    let mut sql = String::from("SELECT COUNT(*) FROM rpc_events");
    let mut binds: Vec<Box<dyn duckdb::ToSql>> = Vec::new();
    if let Some(s) = server {
        sql.push_str(" WHERE server_name = ?");
        binds.push(Box::new(s.to_string()));
    }
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let cnt: i64 = stmt
        .query_row(
            duckdb::params_from_iter(binds.iter().map(|b| &**b as &dyn duckdb::ToSql)),
            |row| row.get(0),
        )
        .map_err(|e| format!("query: {e}"))?;
    Ok(cnt)
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
    let conn = DuckConn::open(path).map_err(|e| format!("open db: {e}"))?;
    let mut sql = String::from(
        "SELECT id::VARCHAR, CAST(epoch(ts) * 1000 AS BIGINT) AS ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, CAST(request_json AS VARCHAR), CAST(response_json AS VARCHAR) FROM rpc_events WHERE ts > TO_TIMESTAMP(?/1000.0)",
    );
    let mut binds: Vec<Box<dyn duckdb::ToSql>> = vec![Box::new(since_ts_ms)];
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
    sql.push_str(" ORDER BY ts DESC, id DESC LIMIT ?");
    let limit = if limit == 0 { 50 } else { limit.min(200) } as i64;
    binds.push(Box::new(limit));
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(
            duckdb::params_from_iter(binds.iter().map(|b| &**b as &dyn duckdb::ToSql)),
            |row| {
                let id: String = row.get(0)?;
                let ts_ms: i64 = row.get(1)?;
                let session_id: String = row.get(2)?;
                let method: String = row.get(3)?;
                let server_name: Option<String> = row.get(4).ok();
                let server_version: Option<String> = row.get(5).ok();
                let server_protocol: Option<String> = row.get(6).ok();
                let duration_ms: Option<i64> = row.get(7).ok();
                let ok: bool = row.get(8)?;
                let error: Option<String> = row.get(9).ok();
                let req_s: Option<String> = row.get(10).ok();
                let res_s: Option<String> = row.get(11).ok();
                let request_json = req_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
                let response_json = res_s.and_then(|s| serde_json::from_str::<JsonValue>(&s).ok());
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
