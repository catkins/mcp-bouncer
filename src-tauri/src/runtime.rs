use std::{
    fs,
    path::PathBuf,
    sync::{
        Arc, OnceLock, RwLock,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use tokio::sync::Mutex;

use crate::config::{ConfigProvider, IncomingClient, OsConfigProvider};

pub struct RuntimeState {
    config_provider: Arc<dyn ConfigProvider>,
    incoming: IncomingTracker,
}

impl RuntimeState {
    pub fn new(config_provider: Arc<dyn ConfigProvider>) -> Self {
        Self {
            config_provider,
            incoming: IncomingTracker::default(),
        }
    }

    pub fn config_provider(&self) -> Arc<dyn ConfigProvider> {
        self.config_provider.clone()
    }

    pub fn incoming(&self) -> &IncomingTracker {
        &self.incoming
    }
}

/// Create a unique, temporary `ConfigProvider` rooted under the system temp directory.
/// Useful for tests that need an isolated configuration space.
pub fn ephemeral_config_provider(prefix: &str) -> Arc<dyn ConfigProvider> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let tid = format!("{:?}", thread::current().id());
    let dir = std::env::temp_dir().join(format!(
        "mcp-bouncer-{prefix}-{}-{}-{}",
        std::process::id(),
        tid,
        stamp
    ));
    // Best-effort create; ignore errors other than panic to avoid interfering with tests.
    let _ = fs::create_dir_all(&dir);
    Arc::new(TempConfigProvider { base: dir })
}

static GLOBAL_RUNTIME: OnceLock<RwLock<Arc<RuntimeState>>> = OnceLock::new();

fn runtime_cell() -> &'static RwLock<Arc<RuntimeState>> {
    GLOBAL_RUNTIME.get_or_init(|| {
        let provider: Arc<dyn ConfigProvider> = Arc::new(OsConfigProvider);
        RwLock::new(Arc::new(RuntimeState::new(provider)))
    })
}

pub fn global() -> Arc<RuntimeState> {
    runtime_cell()
        .read()
        .expect("runtime lock poisoned")
        .clone()
}

pub fn set_global(runtime: Arc<RuntimeState>) {
    *runtime_cell().write().expect("runtime lock poisoned") = runtime;
}

#[derive(Default)]
pub struct IncomingTracker {
    entries: Mutex<Vec<IncomingClient>>,
    next_id: AtomicU64,
}

impl IncomingTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn record_connect(
        &self,
        name: String,
        version: String,
        title: Option<String>,
    ) -> String {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let id_str = format!("{}-{id}", std::process::id());
        let client = IncomingClient {
            id: id_str.clone(),
            name,
            version,
            title,
            connected_at: Some(iso8601_now()),
        };
        let mut guard = self.entries.lock().await;
        guard.push(client);
        id_str
    }

    pub async fn list(&self) -> Vec<IncomingClient> {
        let guard = self.entries.lock().await;
        guard.clone()
    }

    pub async fn clear(&self) {
        let mut guard = self.entries.lock().await;
        guard.clear();
    }
}

fn iso8601_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Clone)]
struct TempConfigProvider {
    base: PathBuf,
}

impl ConfigProvider for TempConfigProvider {
    fn base_dir(&self) -> PathBuf {
        self.base.clone()
    }
}
