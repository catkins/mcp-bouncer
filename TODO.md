# TODO

- [x] Modularize backend into workspace crates
  - Summary: Break `src-tauri` into `mcp-bouncer-core` (config, client registry, overlay), `mcp-bouncer-logging`, and a thin `mcp-bouncer-tauri` binary crate so incremental builds skip heavy code when editing commands or UI glue.
  - Justification: Today every code change re-compiles the entire crate, including heavy dependencies like `duckdb`, `axum`, and `rmcp` (see `src-tauri/Cargo.toml`). Isolating crates allows Cargo to cache more artifacts and lets us gate slow dependencies (per https://corrode.dev/blog/tips-for-faster-rust-compile-times/).
  - Trade-offs: Introduces workspace plumbing, new crate boundaries, and requires updating imports/tests. Initial re-org is non-trivial and we must ensure Tauri build scripts still locate assets.

- [ ] Gate the DuckDB logger behind a feature-friendly crate
  - Summary: Move `logging.rs` into its own crate with a trait-based sink so the Tauri app depends on it optionally; default builds can disable DuckDB to cut compile times while still allowing a “full” feature for releases.
  - Justification: `src-tauri/src/logging.rs` pulls in bundled DuckDB (`duckdb` with `bundled` feature) which dominates compile time and links native code even for dev builds that may not need persistence.
  - Trade-offs: Need a lightweight in-memory fallback for tests/preview builds and extra work to plumb feature flags throughout the workspace.

- [ ] Refactor Tauri commands into dedicated service modules with unit coverage
  - Summary: Extract the business logic from `src-tauri/src/main.rs` (e.g., `mcp_update_server` at `main.rs:127` and `mcp_toggle_server_enabled` at `main.rs:180`) into plain Rust functions so we can unit-test server lifecycle and error branches without spinning up Tauri.
  - Justification: The 600+ line `main.rs` mixes command routing, event emission, and state transitions, making it hard to test or reason about regressions. Breaking it up improves readability and enables isolated tests.
  - Trade-offs: Requires re-plumbing Specta exports and wiring the new modules; we must keep the public API surface stable for the frontend bindings.

- [ ] Introduce configurable HTTP client builders with timeouts and dependency injection
  - Summary: Factor the repeated header-building code in `client.rs:72-115` into a helper that also applies connect/read timeouts and accept injecting a mock client for tests.
  - Justification: Today we instantiate default `reqwest::Client`s without timeouts (`client.rs:59`, `client.rs:82`, `client.rs:112`), which risks hanging the UI and makes it difficult to simulate failures. Centralizing the builder makes the code smaller and testable.
  - Trade-offs: Slightly more abstraction and plumbing (passing builders/traits around) and we must ensure OAuth-authenticated transports still satisfy the rmcp APIs.

- [ ] Cache persisted settings and tool state to reduce disk churn
  - Summary: Introduce an async cache or watch layer around `load_settings_with` and `load_tools_state_with` (see `config.rs:61-102` and `tools_cache.rs:23-36`) so hot paths no longer hit the filesystem for every command.
  - Justification: Commands like `mcp_add_server` and `mcp_get_client_tools` call the loaders frequently, which can stall responsiveness on slower disks and complicate testing. A cache with invalidation on save keeps UX snappy.
  - Trade-offs: Need to manage cache invalidation carefully (e.g., after external edits) and provide hooks for tests to flush the cache.

- [x] Harden and test the OAuth callback flow
  - Summary: Add unit/integration tests for `load_credentials_for`/`save_credentials_for` and refactor `start_oauth_for_server` (`oauth.rs:69-189`) to keep a handle to the Axum task, apply request timeouts, and surface clearer errors/events.
  - Justification: OAuth is a high-risk path with minimal coverage today; failures can silently hang because we drop the server handle and rely on default client timeouts.
  - Trade-offs: Tests will need mock transports or a local HTTP harness, and we must ensure new timeout defaults don’t break slow-but-valid providers.

- [ ] Centralize authorization gating and overlay updates
  - Summary: Pull the repeated "requires OAuth" logic from the Tauri commands and `connect_and_initialize` (`main.rs:188-209`, `client.rs:170-174`, `unauthorized.rs:6-18`) into a single policy module so status transitions stay consistent.
  - Justification: The current duplication increases the odds of divergent behavior (e.g., forgetting to emit `client_status_changed`) and makes it harder to add tests; a shared helper simplifies reasoning and enables targeted unit tests.
  - Trade-offs: Needs careful design to avoid circular deps between overlay, client, and events, and we must update existing calls atomically.

- [ ] Trim unused rmcp features and adopt feature flags for heavy deps
  - Summary: Audit the `rmcp` feature list in `Cargo.toml` and disable anything unused (e.g., `transport-worker` isn’t referenced) while exposing workspace features to toggle `axum`/`reqwest` extras.
  - Justification: Reducing enabled features lowers compile times and binary size, aligning with the compilation tips in the linked article.
  - Trade-offs: Risk of accidentally dropping a feature required by future work; CI must exercise both minimal and full builds to prevent regressions.

- [ ] Extend integration tests to cover client lifecycle and logging edge cases
  - Summary: Add tests around `connect_and_initialize` success/error paths, DuckDB flushing (`logging.rs:133-199`), and unauthorized probes to increase confidence in failure handling.
  - Justification: These flows currently rely on manual testing even though regressions would break core UX; structured tests improve maintainability and catch race conditions early.
  - Trade-offs: More test harness code and potentially slower CI, especially if DuckDB remains in-process; we may need to add feature-gated mocks.
