This file provides guidance to coding agents when working with code in this repository.

## Development Commands (Tauri v2)

### App (dev/build)
- Dev (Vite + Tauri): `npx tauri dev`
- Build app: `cargo tauri build`
- Backend only: `cargo build --manifest-path src-tauri/Cargo.toml`

### Frontend
- Dev server: `npm run dev`
- Build: `npm run build`
- Format: `npm run format` / `npm run format:check`

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

#### Testability Notes (backend)

- Avoid business logic in `main.rs`. Implement in `config.rs`, `client.rs`, `status.rs`, or a focused module and import from `main.rs`.
- Filesystem: accept a `&dyn ConfigProvider` when adding persistence so tests can redirect IO.
- Events: use `events::EventEmitter` and helper functions (`servers_updated`, `client_status_changed`, etc.). In Tauri commands, wrap `AppHandle` with `TauriEventEmitter`. In tests, use `MockEventEmitter`.
- Status: prefer `status::compute_client_status_map_with(cp, registry, lister)` for unit tests; production code uses `compute_client_status_map` which defaults to the OS provider.

#### Running Tests

- Rust backend tests: `cd src-tauri && cargo test --lib --tests`

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

## Git Commits
Only create git commits when explicitly asked by the user. Do not automatically commit changes unless requested.
