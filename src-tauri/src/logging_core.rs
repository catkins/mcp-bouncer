use std::{
    cell::RefCell,
    future::Future,
    sync::atomic::{AtomicI64, Ordering},
};

use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::config::{ConfigProvider, Settings};
use crate::events::EventEmitter;

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
    pub origin: Option<String>,
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
            origin: None,
        }
    }
}

// Monotonic-ish millisecond clock to ensure strictly increasing timestamps per-process
static LAST_MS: AtomicI64 = AtomicI64::new(0);
fn now_millis() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    loop {
        let prev = LAST_MS.load(Ordering::Relaxed);
        let next = if now > prev { now } else { prev + 1 };
        if LAST_MS
            .compare_exchange(prev, next, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
        {
            return next;
        }
    }
}

/// Abstraction over RPC event logging so heavyweight persistence can live in a sibling crate.
pub trait RpcEventPublisher: Clone + Send + Sync + 'static {
    /// Initialize any underlying logging backend with the current config.
    fn init_with(&self, cp: &dyn ConfigProvider, settings: &Settings);
    /// Persist an event without emitting UI updates.
    fn log(&self, event: Event);
    /// Persist and emit an event to listeners.
    fn log_and_emit<E: EventEmitter>(&self, emitter: &E, event: Event);
}

tokio::task_local! {
    static REQUEST_ORIGIN: RefCell<Option<String>>;
}

/// Execute `f` with the given origin bound for downstream logging interceptors.
pub async fn with_request_origin<F, Fut, T>(origin: impl Into<String>, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let origin = origin.into();
    REQUEST_ORIGIN
        .scope(RefCell::new(Some(origin)), async move { f().await })
        .await
}

/// Execute `f` with an optional origin. When `origin` is `None`, the previous
/// scope (if any) is cleared for the duration of `f`.
pub async fn with_optional_request_origin<F, Fut, T>(origin: Option<String>, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    REQUEST_ORIGIN
        .scope(RefCell::new(origin), async move { f().await })
        .await
}

/// Inspect the current request origin (if one has been set on this task).
pub fn current_request_origin() -> Option<String> {
    REQUEST_ORIGIN
        .try_with(|cell| cell.borrow().clone())
        .ok()
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn scopes_override_and_restore() {
        assert!(current_request_origin().is_none());
        let outer = with_request_origin("outer", || async {
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
            with_request_origin("inner", || async {
                assert_eq!(current_request_origin().as_deref(), Some("inner"));
            })
            .await;
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
        });
        outer.await;
        assert!(current_request_origin().is_none());
    }

    #[tokio::test]
    async fn optional_scope_clears_origin() {
        with_request_origin("outer", || async {
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
            with_optional_request_origin(None, || async {
                assert!(current_request_origin().is_none());
            })
            .await;
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
        })
        .await;
    }
}
