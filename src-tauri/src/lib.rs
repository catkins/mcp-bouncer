pub use mcp_bouncer_core::{
    app_logic, client, config, incoming, oauth, overlay, server, status, tools_cache, types,
    unauthorized,
};

pub mod logging {
    pub use mcp_bouncer_core::logging::{Event, RpcEventPublisher};
    pub use mcp_bouncer_logging::{
        DuckDbPublisher, EventRow, QueryParams, count_events, db_path, force_flush_and_checkpoint,
        init_once, init_once_with, log_rpc_event, query_events, query_events_since,
    };
}

pub mod events {
    pub use mcp_bouncer_core::events::*;
    use tauri::Emitter;

    #[derive(Clone)]
    pub struct TauriEventEmitter(pub tauri::AppHandle);

    impl EventEmitter for TauriEventEmitter {
        fn emit(&self, event: &str, payload: &serde_json::Value) {
            let _ = self.0.emit(event, payload);
        }
    }
}
