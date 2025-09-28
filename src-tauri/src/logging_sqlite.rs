use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use crate::config::{ConfigProvider, OsConfigProvider, Settings};
use crate::events::{EventEmitter, logs_rpc_event};
use crate::logging_core::{Event, RpcEventPublisher};
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::{ConnectOptions, Connection, SqliteConnection};
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
        .await?;
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

fn migration_statements() -> impl Iterator<Item = &'static str> {
    MIGRATION_SQL
        .split(';')
        .map(str::trim)
        .filter(|stmt| !stmt.is_empty())
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
