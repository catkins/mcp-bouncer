use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use duckdb::{params, Connection as DuckConn};
use serde_json::Value as JsonValue;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration, Instant};
use uuid::Uuid;

use crate::config::{ConfigProvider, OsConfigProvider, Settings};

#[derive(Debug, Clone)]
pub struct Event {
    pub id: Uuid,
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
    // Initialize-only enrichment
    pub client_name: Option<String>,
    pub client_version: Option<String>,
    pub client_protocol: Option<String>,
}

impl Event {
    pub fn new(method: impl Into<String>, session_id: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            ts_ms: now_millis(),
            session_id: session_id.into(),
            method: method.into(),
            server_name: None,
            server_version: None,
            server_protocol: None,
            duration_ms: None,
            ok: true,
            error: None,
            request_json: None,
            response_json: None,
            client_name: None,
            client_version: None,
            client_protocol: None,
        }
    }
}

fn now_millis() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    now.as_millis() as i64
}

#[derive(Clone)]
pub struct LoggerCfg {
    pub enabled: bool,
    pub db_path: PathBuf,
    pub redact_keys: Vec<String>, // lowercased
}

static LOGGER: OnceLock<LoggerHandle> = OnceLock::new();

#[derive(Clone)]
pub struct LoggerHandle {
    pub tx: mpsc::Sender<Event>,
    pub cfg: Arc<LoggerCfg>,
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
    let cfg = LoggerCfg { enabled, db_path: db_path.clone(), redact_keys };
    let (tx, rx) = mpsc::channel::<Event>(8_192);
    let handle = LoggerHandle { tx, cfg: Arc::new(cfg) };
    if LOGGER.set(handle.clone()).is_ok() {
        // Spawn background writer
        tokio::spawn(async move { writer_task(handle.cfg.clone(), rx).await });
    }
}

pub fn init_once() {
    let settings = crate::config::load_settings();
    init_once_with(&OsConfigProvider, &settings);
}

pub fn log_rpc_event(mut evt: Event) {
    if let Some(handle) = LOGGER.get() {
        if handle.cfg.enabled {
            // Redact before sending
            evt.request_json = evt
                .request_json
                .map(|v| redact_json(v, &handle.cfg.redact_keys));
            evt.response_json = evt
                .response_json
                .map(|v| redact_json(v, &handle.cfg.redact_keys));
            let _ = handle.tx.try_send(evt);
        }
    }
}

async fn writer_task(cfg: Arc<LoggerCfg>, mut rx: mpsc::Receiver<Event>) {
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
        loop {
            let deadline = Duration::from_millis(250);
            match timeout(deadline, rx.recv()).await {
                // Received an event
                Ok(Some(e)) => {
                    buf.push(e);
                    if buf.len() >= 256 || last.elapsed() >= deadline {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "flush_failed");
                        }
                        buf.clear();
                        last = Instant::now();
                    }
                }
                // Channel closed: flush any pending and exit
                Ok(None) => {
                    if !buf.is_empty() {
                        if let Err(e) = flush_events(&mut conn, &buf) {
                            tracing::warn!(target = "logging", count=buf.len(), error=%e, "final_flush_failed");
                        }
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
                    continue;
                }
            }
        }
        return;
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
        let mut upd_seen = tx.prepare(
            "UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?"
        )?;
        let mut ins = tx.prepare(
            "INSERT INTO rpc_events(id, ts, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json)
             VALUES (?, TO_TIMESTAMP(?/1000.0), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )?;

        for e in events {
            // Upsert session (only create if initialize provided client info)
            if e.client_name.is_some() || e.client_version.is_some() || e.client_protocol.is_some() {
                let _ = up_sess.execute(params![
                    &e.session_id,
                    &e.client_name,
                    &e.client_version,
                    &e.client_protocol,
                    &e.session_id,
                ]);
            }
            let _ = upd_seen.execute(params![&e.session_id]);
            let req = e.request_json.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
            let res = e.response_json.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
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

fn flush_jsonl(path: &PathBuf, events: &[Event]) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    for e in events {
        let mut obj = serde_json::json!({
            "id": e.id,
            "ts_ms": e.ts_ms,
            "session_id": e.session_id,
            "method": e.method,
            "server_name": e.server_name,
            "duration_ms": e.duration_ms,
            "ok": e.ok,
            "error": e.error,
        });
        if let Some(req) = &e.request_json { obj["request_json"] = req.clone(); }
        if let Some(res) = &e.response_json { obj["response_json"] = res.clone(); }
        if let Some(n) = &e.client_name { obj["client_name"] = serde_json::json!(n); }
        if let Some(v) = &e.client_version { obj["client_version"] = serde_json::json!(v); }
        let line = serde_json::to_string(&obj).unwrap_or_default();
        writeln!(f, "{}", line)?;
    }
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
