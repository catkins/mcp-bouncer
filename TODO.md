# Logs UI Integration Plan

Goal: Add a new Logs tab in the app to browse MCP JSON‑RPC request logs captured by the backend (DuckDB), with server filtering, keyset‑pagination, infinite scroll, live updates, readable timestamps, and syntax‑highlighted JSON payloads. Logs are shown most‑recent first.

## Summary of current logging (read‑through)
- Source: `src-tauri/src/logging.rs` provides an always‑on async writer buffering events and persisting to `logs.duckdb`.
- Schema: `sessions(session_id, created_at, client_name, client_version, client_protocol, last_seen_at)` and `rpc_events(id, ts, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json)` with indexes on `rpc_events(ts)` and `rpc_events(session_id)`.
- Redaction: Sensitive keys are masked recursively before enqueue (`authorization`, `token`, `password`, `secret`, `api_key`, `access_token`).
- Flush cadence: ~250ms batch flush or at 256 items, and periodic `CHECKPOINT` every ~1s and on explicit flush.
- Producers: Events are created in `src-tauri/src/server.rs` at key RPC boundaries (initialize, listTools, callTool, other). Session enrichment for `initialize` captures client fields.

Implications: We should query via keyset pagination on `(ts DESC, id DESC)` for stable ordering and performance. For live updates we can either push on enqueue or poll after the last seen cursor.

---

## Backend (Tauri) additions

1) Query commands (read‑only)
- `mcp_logs_list(params)`
  - Input: `{ server?: string, method?: string, ok?: boolean, limit?: number, after?: { ts_ms: number, id: string } }`
  - Behavior: Returns most‑recent first ordered list. If `after` is provided, uses keyset pagination with `WHERE (ts, id) < (TO_TIMESTAMP(after.ts_ms/1000), after.id)`.
  - Output items: `{ id, ts_ms, session_id, method, server_name, server_version, server_protocol, duration_ms, ok, error, request_json, response_json }`.
  - Defaults: `limit=50`, no filters.

- `mcp_logs_list_since(params)`
  - Input: `{ since_ts_ms: number, server?: string, limit?: number }`
  - Behavior: Fetches events newer than the provided timestamp (for catch‑up on live updates). Ordered most‑recent first.

Implementation notes:
- Add a small query helper in `src-tauri/src/logging.rs` (new `pub async fn query_events(...) -> Result<Vec<EventRow>, String>`), reusing the existing DB path (`db_path()`), opening a connection per call.
- Ensure all fields are redacted already (they are, prior to enqueue). Return `request_json` and `response_json` as `serde_json::Value` to avoid stringify/parse thrash in the UI.
- Export the Tauri commands from `main.rs` with `#[specta::specta]` so bindings regenerate in dev builds (`src/tauri/bindings.ts`).

2) Live update event (push, optional step)
- Event name: `logs:rpc_event`
- Payload: subset of `Event` after redaction `{ id, ts_ms, session_id, method, server_name, duration_ms, ok, error, request_json, response_json }`.
- Emission strategy options:
  - A) Emit directly from call sites in `server.rs` immediately after `logging::log_rpc_event(e.clone())` to avoid coupling logging module to Tauri. Use existing `EventEmitter` in `BouncerService`.
  - B) Add an optional broadcast within `logging` and a `set_event_sink(EventEmitter)` API; emit as items are enqueued (after redaction). Simpler for future non‑server producers.
- Plan: Start with A for simplicity; we already have the emitter in scope at all log points.

3) Tests
- Add unit test for query helper to assert descending order and server filter.
- Extend `src-tauri/tests/logging_integration.rs` with a DuckDB read verifying pagination cursors behave as expected.

---

## Frontend additions

1) Tabs and routing
- Update `src/App.tsx`: add third tab `Logs` to `TabSwitcher` and render `<LogsPage />` when selected.
- Keep default tab as `servers`; remember last tab in `localStorage` for convenience.

2) New page and components
- `src/pages/LogsPage.tsx` (container):
  - State: filters (`server`, `method?`, `ok?`), items array, `cursor` (last `{ ts_ms, id }`), loading flags, live tail toggle.
  - Effects: initial fetch, refetch on filter change, live updates subscription.
  - Layout: sidebar/topbar with filters; main list with infinite scroll.

- `src/components/logs/LogsFilterBar.tsx`:
  - Server filter: dropdown populated via `MCPService.List()`.
  - Method filter: multi/select or simple segmented control for `initialize`, `listTools`, `callTool`, `other` (optional for v1).
  - Status filter: All/Success/Errors.
  - Clear filters button.

- `src/components/logs/LogList.tsx` + `LogListItem.tsx`:
  - Virtualized or windowed list is optional initially; page size 50 is acceptable with simple rendering.
  - Each item shows:
    - Icon (Heroicons) per method
    - Server badge and method label
    - Timestamp (formatted)
    - Duration and status (green/red pill)
    - Collapsible JSON sections for Request / Response with syntax highlighting

3) Data layer and subscriptions
- `src/hooks/useRpcLogs.ts`:
  - `loadPage({ server?, method?, ok?, after? })` → calls `MCPService.LogsList(...)` to fetch next page; appends to list.
  - `reload()` → resets cursor and fetches first page.
  - `useEffect` with IntersectionObserver on sentinel at list bottom to trigger `loadPage` when nearing end.
  - Live updates: subscribe to `logs:rpc_event` via `event.listen`; when a matching event arrives (respecting current filters), unshift into the list. If not at top, show a “New logs” toast with a “Jump to top” action. As a fallback, if push events are disabled, poll `mcp_logs_list_since({ since_ts_ms: lastTopTs })` every ~1–2s when live tail is enabled.

4) Visuals and UX
- Heroicons mapping (solid, 20):
  - `initialize` → `RocketLaunchIcon` or `SparklesIcon`
  - `listTools` → `WrenchScrewdriverIcon`
  - `callTool` → `PlayCircleIcon` or `WrenchIcon`
  - `other` → `EllipsisHorizontalCircleIcon`
- Status coloring: `ok=true` green; `ok=false` red.
- Timestamps: use `date-fns` (`format` like `PPP p`) and tooltip with relative time via `formatDistanceToNowStrict`.
- JSON rendering: pretty‑print and syntax‑highlight. Use `prism-react-renderer` or `react-syntax-highlighter` (lightweight, SSR‑safe). Collapsible panels default to collapsed for large payloads; remember expand/collapse per item.

5) Types and bindings
- Add `src/types/logs.ts` for shared TS shapes matching command outputs.
- Ensure dev build regenerates `src/tauri/bindings.ts` (already configured via specta in debug builds).

6) Tests (RTL)
- `LogsPage` renders empty state and loads first page.
- Changing server filter resets and refetches.
- Infinite scroll triggers `loadPage` when sentinel intersects.
- Live updates: mock `logs:rpc_event` and assert prepend and toast.

7) Performance and limits
- Default page size: 50; cap to 200.
- Avoid rendering megabyte‑sized JSON: collapse by default if payload stringified size > 8KB; show approximate size.
- Debounce filter changes (300ms) to limit queries.

---

## Implementation steps (checklist)

- [ ] Backend: implement `query_events` in `logging.rs` (DuckDB read helpers).
- [ ] Backend: add Tauri commands `mcp_logs_list`, `mcp_logs_list_since` in `main.rs` using the helper; export via specta.
- [ ] Backend: emit `logs:rpc_event` from server call sites after `log_rpc_event` with redacted payload.
- [ ] Frontend: add `Logs` tab to `src/App.tsx` and wire to `<LogsPage />`.
- [ ] Frontend: `src/pages/LogsPage.tsx` plus `LogsFilterBar`, `LogList`, `LogListItem` components.
- [ ] Frontend: `useRpcLogs` hook for paging, infinite scroll, and live updates.
- [ ] Frontend: syntax highlighting dependency (`prism-react-renderer`) and JSON pretty printer utility.
- [ ] Frontend: heroicons mapping and status/timestamp UI polish.
- [ ] Tests: RTL for Logs page basics; backend unit test for filters/order; extend integration test for pagination.
- [ ] Verification: `npm run build`, `npm run test:run`, and `cargo test --manifest-path src-tauri/Cargo.toml`.

---

## Decisions / follow‑ups
- Add a count API and show a simple count badge on the Logs tab (all events, with optional server filter on badge later).
- Defer method name filters to a follow‑up: expose a pre‑populated dropdown of known MCP message types (initialize, listTools, callTool, other) after the v1 shipping pass.
- Prefer small focused functional components over monoliths. Keep `LogsPage` thin and split view into `LogsFilterBar`, `LogList`, and `LogListItem` components.

