JSON-RPC Logging Persistence (DuckDB) — Implementation Spec

Goal
- Intercept and persist all JSON-RPC requests/responses traversing the MCP bouncer between incoming clients and upstream servers, with minimal overhead and clear queryability for future UI log views.

Scope (Phase 1)
- Capture and persist: method, request payload, response payload (or error), timestamps, duration, event UUID, session id, client info (name, version, protocol), and upstream server info (name; version/protocol where available).
- Storage: DuckDB embedded database on disk, under the app’s config directory.
- Performance: Non-blocking capture in the request path via an async buffered writer task.
- Config: Opt-in/opt-out flag (default: on for dev builds, off for release until we confirm UX), DB path override, and simple retention toggle (manual vacuum/purge TBD).
- Test coverage: unit + integration tests verifying writes and basic queries.

Non-Goals (Phase 1)
- UI browsing of logs (added later).
- Advanced PII redaction rules (minimal configurable redaction only; see below).
- Streaming of logs to remote sinks (consider in later phases).

High-Level Design
1) Instrument the MCP proxy request handling layer to record events:
   - Incoming endpoint is implemented by `BouncerService<E, CP>` in `src-tauri/src/server.rs` which handles `ClientRequest` and returns `ServerResult`.
   - For each handled request (Initialize, ListTools, CallTool, etc.), we capture request data, capture a start time, proceed to handle, then capture the response (or error) and compute duration.
   - We also capture client info from Initialize (already parsed in `incoming.rs`/`emit_incoming_from_initialize`) and persist/update a session record.
   - For outbound calls to an upstream (e.g., CallTool), we add the resolved upstream `server_name` to the event. For aggregated `ListTools`, we set `server_name = 'aggregate'` and record an `upstreams` JSON payload with per-server results.

2) Session identity and lifecycle:
   - We run the Streamable HTTP server in `stateful_mode: true` (already set). We will extract a per-connection session id from the `RequestContext<RoleServer>` provided to `handle_request` (e.g., `context.session_id()` / equivalent). If RMCP context does not expose a session id directly, we will extend the service instantiation to capture a unique identifier from the session manager (e.g., via `LocalSessionManager`) and include it in context or thread-local. Fallback: generate a UUID for the first Initialize and store a cookie-backed map keyed by the rmcp session token.
   - The first Initialize received for a session creates a `sessions` row containing client info and protocol version; subsequent requests use the same session id.

3) Persistence pipeline:
   - Add a new `db` (or `logging`) module that owns a single DuckDB connection in a background task.
   - Expose a non-blocking API `log_rpc_event(Event)` that sends events via `tokio::mpsc::Sender<Event>` to the writer.
   - The writer batches inserts (e.g., up to 256 events or 250ms, whichever first) in a transaction for throughput.
   - On app shutdown, we flush the queue (best-effort) and close the connection.

4) Redaction & safety:
   - Provide a minimal redaction hook that can mask obvious sensitive fields by key (configurable list, defaults: `authorization`, `token`, `password`, `secret`, `api_key`, `access_token`).
   - Redaction happens right before persistence (in the writer, not on the hot path), to keep capture overhead low.

5) Configuration:
   - Extend settings with:
     - `logging.db_path: string` (default `${XDG_CONFIG_HOME}/mcp-bouncer/logs.duckdb`).
     - `logging.redact_keys: string[]`.
   - Emit `settings:updated` when changed (existing pattern).

6) Schema (DuckDB)
DuckDB types used: `TEXT`, `BIGINT`, `TIMESTAMP`, `BOOLEAN`, `JSON`, `UUID`.

- Table: `sessions`
  - `session_id` TEXT PRIMARY KEY
  - `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `client_name` TEXT
  - `client_version` TEXT
  - `client_protocol` TEXT
  - `last_seen_at` TIMESTAMP NOT NULL

- Table: `rpc_events`
  - `id` UUID PRIMARY KEY
  - `ts` TIMESTAMP NOT NULL
  - `session_id` TEXT REFERENCES sessions(session_id)
  - `method` TEXT NOT NULL  -- e.g., initialize, listTools, callTool
  - `server_name` TEXT       -- upstream target (or ‘aggregate’)
  - `server_version` TEXT    -- nullable (Phase 1 may be unknown)
  - `server_protocol` TEXT   -- nullable (Phase 1 may be unknown)
  - `duration_ms` BIGINT     -- nullable when not applicable
  - `ok` BOOLEAN NOT NULL    -- success flag (derived from response)
  - `error` TEXT             -- message if `ok=false`
  - `request_json` JSON      -- redacted JSON-RPC request payload
  - `response_json` JSON     -- redacted JSON-RPC response payload

- Table: `rpc_event_upstreams` (optional, only for aggregate listTools)
  - `event_id` UUID REFERENCES rpc_events(id)
  - `server_name` TEXT NOT NULL
  - `request_json` JSON
  - `response_json` JSON

Indexes:
- `CREATE INDEX IF NOT EXISTS idx_events_ts ON rpc_events(ts);`
- `CREATE INDEX IF NOT EXISTS idx_events_session ON rpc_events(session_id);`
- `CREATE INDEX IF NOT EXISTS idx_events_method ON rpc_events(method);`
- `CREATE INDEX IF NOT EXISTS idx_events_server ON rpc_events(server_name);`

Data flow & capture points
- server.rs (BouncerService::handle_request):
  - Before handling, record `start = Instant::now()` and serialize the request (`serde_json::to_value(&req)`), and extract `method` enum variant to string.
  - Determine `session_id` from `RequestContext` (preferred). Fallback: map per-thread or generate per-Initialize.
  - For CallTool, derive `server_name` from qualified `name` (split on `::`). For ListTools with multiple upstreams, set `server_name = 'aggregate'` and optionally populate `rpc_event_upstreams` rows per upstream with their partial responses.
  - After handling, serialize the result (`serde_json::to_value(&res)`), compute `duration_ms`, set `ok/error` accordingly.
  - Emit `log_rpc_event(Event { … })`.

- Initialize: additionally upsert `sessions` with client info parsed from Initialize (client name/version/protocol); set `last_seen_at=now()`.
  - We already parse client info via `emit_incoming_from_initialize`. We will refactor to funnel data to both events and sessions persistence.

- Upstream metadata: In Phase 1, only `server_name` is guaranteed. We will add server version/protocol in Phase 2 by:
  - Capturing upstream `get_info()` when clients connect (if rmcp API provides it), storing in a cache keyed by upstream name and session, and attaching to events.

Module layout (backend)
- `src-tauri/src/logging.rs` (new)
  - `init_logger(cp: &dyn ConfigProvider, enabled: bool, path_override: Option<&str>, redact_keys: &[&str]) -> Result<()>`
    - Creates `duckdb::Connection` to `${base}/logs.duckdb`.
    - Runs `CREATE TABLE IF NOT EXISTS …` statements and indexes.
    - Spawns background writer task; stores a `Sender<Event>` in a global `OnceLock`.
  - `log_rpc_event(evt: Event) -> Result<(), TrySendError>` — fast path enqueue.
  - `record_session(session: SessionRow)` — enqueues a session upsert (or maintains a small cache so we don’t spam updates).
  - `shutdown_logger()` — flush channel, join task (best-effort during app shutdown).
  - `Event` struct: fields align with `rpc_events` schema; `request_json`/`response_json` are `serde_json::Value`.
  - Minimal redaction helper: given a JSON value, mask known keys recursively.

- Wire-up
  - In `main.rs::setup`, call `init_logger(&OsConfigProvider, /*enabled*/ cfg)`. Use `OnceLock` semantics to avoid double-init.
  - In `server.rs::BouncerService::handle_request` and `handle_notification`, call `log_rpc_event`.
  - In `server.rs::emit_incoming_from_initialize`, call `record_session` with parsed client fields and session id.

Settings changes
- Extend `src-tauri/src/config.rs`:
  - Add:
    ```rust
    #[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
    pub struct LoggingConfig {
        pub enabled: bool,
        #[serde(default)] pub db_path: Option<String>,
        #[serde(default)] pub redact_keys: Vec<String>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Type)]
    pub struct Settings { /* existing */ pub logging: Option<LoggingConfig> }
    ```
  - Default for debug builds: `enabled=true`, `redact_keys` pre-populated. Release default: `enabled=false`.
  - Update load/save with backward-compatible defaults.

Concurrency & backpressure
- Channel capacity (e.g., 8k events).
- Writer batches multiple events into a single transaction for speed; target 1–10ms per batch under load.

Error handling
- Writer attempts to insert; on persistent failure, it will log and continue (best-effort). Optionally, it can fall back to writing to a JSONL file in the config dir so data isn’t completely lost and users can investigate.

Privacy & redaction
- Redact values for keys with exact match in `redact_keys` (case-insensitive), recursively through the JSON trees. Replace with `"***"`.
- Initial default keys: `authorization`, `token`, `password`, `secret`, `api_key`, `access_token`.
- Future: pattern-based redaction and per-server configuration.

Migrations & upgrades
- DuckDB is schemaless-friendly, but we will still manage migrations via simple `schema_versions` table.

CI/CD
- Add `duckdb` crate to `src-tauri/Cargo.toml`.
- Buildkite Dockerfile may need `build-essential`/`clang` for DuckDB C++ compilation (duckdb crate bundles sources). Validate on CI.

Testing strategy
- Unit tests:
  - Redaction helper correctness (keys masked, structure preserved).
  - Event batching logic (batch size/time). Use an in-memory DB connection via a test config provider.

- Integration tests:
  - Spin up in-process proxy server (already exists in tests) and issue `Initialize`, `ListTools`, `CallTool` against a test upstream.
  - After requests, query DuckDB for counts by method and presence of session id; assert one `sessions` row and N `rpc_events` rows with expected fields.
  - Verify `server_name` on `CallTool` and `'aggregate'` for `ListTools`.

- Session id source in RMCP RequestContext: confirm exact API to fetch a stable id. If unavailable, we will generate and maintain our own per-connection id via `LocalSessionManager`.
- Server version/protocol availability: identify RMCP client APIs to retrieve upstream server info post-connect; otherwise leave null in Phase 1.

Milestones
1) Plumbing & schema
   - Add `logging` module, DuckDB dependency, init on startup, and basic `sessions`/`rpc_events` creation.
2) Capture Initialize/ListTools/CallTool
   - Add capture calls in `server.rs`; verify end-to-end writes in tests.
3) Redaction + config
   - Redaction helper, settings plumbed, and tests.
4) Server metadata (Phase 2)
   - Capture upstream server info if available; persist in events.
5) UI (later)
   - Build a simple logs view (filters by time, method, server, session).

Example pseudo-code (capture point)
```rust
// server.rs
async fn handle_request(&self, request: mcp::ClientRequest, ctx: RequestContext<RoleServer>) -> Result<mcp::ServerResult, mcp::ErrorData> {
    let start = std::time::Instant::now();
    let session_id = ctx.session_id().unwrap_or_else(|| gen_fallback_session_id());
    let req_json = serde_json::to_value(&request).ok();
    let method = request.method_name(); // helper we add via match
    let mut event = Event::new(method, session_id.clone(), req_json);
    let res = match request { /* existing logic */ };
    let (ok, err, res_json) = match &res { /* derive fields */ };
    event.server_name = derive_server(&request);
    event.ts = chrono::Utc::now();
    event.duration_ms = start.elapsed().as_millis() as i64;
    event.ok = ok;
    event.error = err;
    event.response_json = res_json;
    logging::log_rpc_event(event);
    Ok(res)
}
```

Next steps
- Confirm session id access in RMCP context and upstream info availability.
- Green-light schema and config shape.
- Implement module scaffolding + basic capture for Initialize/ListTools/CallTool.
