This file provides guidance to coding agents when working with code in this repository.

**Please use the standard edit tooling (`apply_patch`, etc.) for file changes; do not invoke ad-hoc Python scripts to rewrite files.**

## Development Commands (Tauri v2)

### App (dev/build)
- Dev (Vite + Tauri): `npx tauri dev`
- Build app: `cargo tauri build`
- Backend only: `cargo build --manifest-path src-tauri/Cargo.toml`

Tip: From the repository root, prefer passing `--manifest-path` for Rust backend tasks:

- Run tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Type-check: `cargo clippy --manifest-path src-tauri/Cargo.toml`
- Build (debug): `cargo build --manifest-path src-tauri/Cargo.toml`
- Format: `cargo fmt --manifest-path src-tauri/Cargo.toml`

### Frontend
- Dev server: `npm run dev`
- Build: `npm run build`
- Tests: `npm run test:run` (Vitest + React Testing Library)
- Format: `npm run format` / `npm run format:check`
 - Lint (no warnings allowed): `npm run lint` / auto-fix: `npm run lint:fix`

#### Verify Changes (required)
- Run `npm run build` to catch type errors and bundling issues.
- Run `npm run lint` and ensure it reports 0 warnings.
- Run ALL tests (no warnings allowed):
  - Rust: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Frontend: `npm run test:run`
- Clippy (must be clean; warnings are errors in CI):
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- Optional parity with CI build step: `cargo tauri build` (release build)

## Architecture Overview

### Application Structure
This is a **Tauri v2** desktop app (Rust backend + WebView frontend) with the official **rmcp** SDK for MCP.

**Main Components:**
- `src-tauri/src/main.rs`: Tauri entry, rmcp Streamable HTTP server bootstrap, plugin setup
- `src-tauri/src/commands.rs`: Tauri command handlers and thin adapters (e.g., settings update)
- `src-tauri/src/lib.rs`: Library crate exporting backend modules for testing/commands
- `src-tauri/src/config.rs`: Settings, client-state, tools toggle persistence + shared types
- `src-tauri/src/client.rs`: RMCP client lifecycle and registry
- `src-tauri/src/status.rs`: Client status aggregation logic
- `src-tauri/src/events.rs`: Event emission abstraction and helpers
- `src-tauri/src/incoming.rs`: In-memory registry of incoming clients recorded on rmcp Initialize
- `src-tauri/tauri.conf.json`: Tauri config (build hooks and frontendDist)
- `src-tauri/capabilities/events.json`: grants `event.listen` to the main window/webview
- `src/tauri/bindings.ts`: generated TypeScript bindings for commands/types (debug builds)
- `src/tauri/bridge.ts`: thin adapter over bindings (unwraps results, exports runtime TransportType constants)
- `src/`: React 19 + TypeScript frontend (Vite, Tailwind 4)

### Backend (Rust)
- Hosts an rmcp Streamable HTTP server at `http://127.0.0.1:8091/mcp`
- Aggregates tools from all enabled upstream servers; tool names are `server::tool`
- Upstream clients via rmcp:
  - Streamable HTTP: `StreamableHttpClientTransport`
  - STDIO: `TokioChildProcess`
- Emits events consumed by UI:
  - `mcp:servers_updated`, `settings:updated`, `mcp:client_status_changed`, `mcp:client_error`, `mcp:incoming_clients_updated`
- Settings JSON: `$XDG_CONFIG_HOME/app.mcp.bouncer/settings.json`
- Incoming clients: recorded when rmcp Initialize is received; `connected_at` uses RFC3339 (ISO 8601) strings for robust JS parsing.

#### Intercepting transport architecture
- **Inbound (proxy server ➝ downstream client)**: The rmcp HTTP server composes `InterceptingSessionManager`, which wraps every session transport with `InterceptingTransport`. The wrapper injects a `RequestLogContext` into each inbound request, tracks elapsed time, enriches initialize/list/callTool events, records notifications, and hands events to the shared `RpcEventPublisher`/UI emitter.
- **Outbound (proxy client ➝ upstream server)**: `ensure_rmcp_client` wraps every constructed transport (HTTP, SSE, stdio) in `InterceptingClientTransport`. The outbound interceptor mirrors the same logging pipeline, ensuring listTools/callTool/etc. invocations and their responses (or errors) are logged even when they originate from the proxy itself (tool refresh, OAuth reconnects, etc.).
- The interceptors store per-request state (start time, serialized payloads, inferred server metadata) so logs have consistent structure regardless of direction. When introducing a new transport, make sure it is wrapped before calling `.serve(...)`, and that the caller passes an emitter + logger through to `ensure_rmcp_client`.

#### JSON-RPC Logging (SQLite)
- Always-on: the backend persistently logs JSON-RPC requests/responses to a SQLite database at `$XDG_CONFIG_HOME/app.mcp.bouncer/logs.sqlite`.
- Schema:
  - `sessions(session_id TEXT PRIMARY KEY, created_at_ms INTEGER, client_name TEXT, client_version TEXT, client_protocol TEXT, last_seen_at_ms INTEGER)`
  - `rpc_events(id TEXT PRIMARY KEY, ts_ms INTEGER, session_id TEXT, method TEXT, server_name TEXT, server_version TEXT, server_protocol TEXT, duration_ms INTEGER, ok INTEGER, error TEXT, request_json TEXT, response_json TEXT)`
  - Indexes on `rpc_events(ts_ms)` and `rpc_events(session_id)`.
- Redaction: sensitive keys are masked recursively before persistence: `authorization`, `token`, `password`, `secret`, `api_key`, `access_token`.
- Flushing & WAL:
  - Events are buffered and flushed every ~250 ms or when batches reach 256 items.
  - The connection runs in WAL mode and triggers `PRAGMA wal_checkpoint(TRUNCATE)` roughly once per second and on explicit flush.
  - Tests may force a flush + checkpoint via `mcp_bouncer::logging::force_flush_and_checkpoint().await`.
- The React app queries this database directly via `@tauri-apps/plugin-sql` (`src/lib/sqlLogging.ts`); the Rust crate no longer exposes Tauri commands for listing logs or histograms.
- Querying examples:
  - `SELECT COUNT(*) FROM rpc_events;`
  - `SELECT DISTINCT method FROM rpc_events;`
  - `SELECT * FROM rpc_events WHERE method = 'callTool' ORDER BY ts_ms DESC LIMIT 10;`

#### Testability Notes (backend)

- Avoid business logic in `main.rs`. Implement in `config.rs`, `client.rs`, `status.rs`, or a focused module and import from `main.rs`.
- Filesystem: accept a `&dyn ConfigProvider` when adding persistence so tests can redirect IO.
- Events: use `events::EventEmitter` and helper functions (`servers_updated`, `client_status_changed`, etc.). In Tauri commands, wrap `AppHandle` with `TauriEventEmitter`. In tests, use `MockEventEmitter`.
- Status: prefer `status::compute_client_status_map_with(cp, registry, lister)` for unit tests; production code uses `compute_client_status_map` which defaults to the OS provider.
- Incoming: use `incoming::record_connect(name, version, title)` within rmcp Initialize handler. Client info extraction in `main.rs` looks under both `clientInfo.*` and `params.client_info.*` shapes.

#### Running Tests

- Rust backend: `cd src-tauri && cargo test --lib --tests`
- Frontend: `npm run test:run`

### Frontend Testing (RTL)
- Library: React Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`).
- Setup: `vitest.config.ts` uses `jsdom` with `src/test/setup.ts` for polyfills and Tauri API mocks.
- Render helper: use `src/test/render.tsx` to render components with providers.
- Queries: prefer accessible queries (role/name/label) over test ids; use `findBy*` or `waitFor` for async.
- Hooks: test hooks through a minimal harness component and RTL `render` (do not use `react-test-renderer` nor manual roots).
- Avoid: enzyme, react-test-renderer, manually creating React roots; assert behavior via the DOM, not implementation details.
- Clean output: tests should run with zero warnings; console noise is suppressed in setup.

### Frontend (React)
- Uses `src/tauri/bridge.ts` (which wraps the generated `src/tauri/bindings.ts`)
- Hooks (`useMCPService`, `useIncomingClients`) subscribe via `event.listen`
- Logs UI data flows through `src/lib/sqlLogging.ts`, which talks to the SQLite database via `@tauri-apps/plugin-sql`.

## Project Structure (Tauri standard)

```
├── src/                  # React app
├── public/
├── index.html
├── package.json
├── vite.config.ts
└── src-tauri/            # Rust (Tauri) crate
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/
    │   └── events.json
    └── src/main.rs
```

## Notes & Guidelines
- Capabilities: if you need new WebView permissions (e.g., shell, fs), add a capability JSON under `src-tauri/capabilities/` and reference it in `tauri.conf.json` under `app.security.capabilities`.
- MCP server routing: keep tool names `server::tool` to avoid collisions across upstreams.
- Settings shape: keep fields stable; UI relies on them. Extend carefully and emit `settings:updated` after writes.
- Events: match existing event names; the UI hooks already listen for them.
- Rust `format!` style: prefer inlined capture syntax (e.g., `format!("{var}")`, `format!("{base}/path")`) over placeholder form (`format!("{}", var)`). This satisfies clippy (`uninlined_format_args`) and keeps code concise.

### Code Hygiene (for agents)
- When removing or replacing code, do not leave stale comments behind — delete them together with the code. Keep diffs focused and free of dead commentary.

## Git Commits
Only create git commits when explicitly asked by the user. Do not automatically commit changes unless requested. Before committing, always run both Rust and frontend tests locally and ensure they pass cleanly with zero warnings.

## CI/CD

- This project uses Buildkite for CI/CD at https://buildkite.com/catkins-test/mcp-bouncer
- Pipeline is defined in `.buildkite/pipeline.yml` using the Docker compose plugin
- Ensure dependencies for CI are updated in `.buildkite/Dockerfile`
- Pipeline info:
  - `org_slug`: `catkins-test`
  - `repo_slug`: `mcp-bouncer`
