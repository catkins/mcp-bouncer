This file provides guidance to coding agents when working with code in this repository.

## Development Commands (Tauri v2)

### App (dev/build)
- Dev (Vite + Tauri): `npx tauri dev`
- Build app: `cargo tauri build`
- Backend only: `cargo build --manifest-path src-tauri/Cargo.toml`

Tip: From the repository root, prefer passing `--manifest-path` for Rust backend tasks:

- Run tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Type-check: `cargo check --manifest-path src-tauri/Cargo.toml`
- Build (debug): `cargo build --manifest-path src-tauri/Cargo.toml`

### Frontend
- Dev server: `npm run dev`
- Build: `npm run build`
- Tests: `npm run test:run` (Vitest + React Testing Library)
- Format: `npm run format` / `npm run format:check`

#### Verify Changes (required)
- Run `npm run build` to catch type errors and bundling issues.
- Run ALL tests (no warnings allowed):
  - Rust: `cargo test --manifest-path src-tauri/Cargo.toml`
  - Frontend: `npm run test:run`

## Architecture Overview

### Application Structure
This is a **Tauri v2** desktop app (Rust backend + WebView frontend) with the official **rmcp** SDK for MCP.

**Main Components:**
- `src-tauri/src/main.rs`: Tauri entry, rmcp Streamable HTTP server, Tauri commands, events
- `src-tauri/src/lib.rs`: Library crate exporting backend modules for testing/commands
- `src-tauri/src/config.rs`: Settings, client-state, tools toggle persistence + shared types
- `src-tauri/src/client.rs`: RMCP client lifecycle and registry
- `src-tauri/src/status.rs`: Client status aggregation logic
- `src-tauri/src/events.rs`: Event emission abstraction and helpers
- `src-tauri/src/app_logic.rs`: Thin adapters (e.g., settings update) using config + events
- `src-tauri/src/incoming.rs`: In-memory registry of incoming clients recorded on rmcp Initialize
- `src-tauri/tauri.conf.json`: Tauri config (build hooks and frontendDist)
- `src-tauri/capabilities/events.json`: grants `event.listen` to the main window/webview
- `src/tauri/bridge.ts`: minimal adapter for Tauri `invoke` + `listen`
- `src/`: React 19 + TypeScript frontend (Vite, Tailwind 4)

### Backend (Rust)
- Hosts an rmcp Streamable HTTP server at `http://127.0.0.1:8091/mcp`
- Aggregates tools from all enabled upstream servers; tool names are `server::tool`
- Upstream clients via rmcp:
  - Streamable HTTP: `StreamableHttpClientTransport`
  - STDIO: `TokioChildProcess`
- Emits events consumed by UI:
  - `mcp:servers_updated`, `settings:updated`, `mcp:client_status_changed`, `mcp:client_error`, `mcp:incoming_clients_updated`
- Settings JSON: `$XDG_CONFIG_HOME/mcp-bouncer/settings.json`
- Incoming clients: recorded when rmcp Initialize is received; `connected_at` uses RFC3339 (ISO 8601) strings for robust JS parsing.

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
- Uses `@tauri-apps/api` with `src/tauri/bridge.ts`
- Hooks (`useMCPService`, `useIncomingClients`) subscribe via `event.listen`
- No Wails bindings — do not import from `frontend/bindings` or `@wailsio/runtime`

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
