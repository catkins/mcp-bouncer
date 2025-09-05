use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use mcp_bouncer::config::ConfigProvider;

#[derive(Clone)]
pub struct TestProvider {
    base: PathBuf,
}

impl TestProvider {
    pub fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let tid = format!("{:?}", std::thread::current().id());
        let dir = std::env::temp_dir().join(format!(
            "mcp-bouncer-tests-{}-{}-{}",
            std::process::id(),
            tid,
            stamp
        ));
        fs::create_dir_all(&dir).unwrap();
        Self { base: dir }
    }
}

impl Default for TestProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ConfigProvider for TestProvider {
    fn base_dir(&self) -> PathBuf {
        self.base.clone()
    }
}
