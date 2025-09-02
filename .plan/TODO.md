1. [ ] Normalize TransportType naming and scope
   - Goal: Rename enum variants to idiomatic Rust PascalCase (e.g., `Stdio`, `Sse`, `StreamableHttp`) and drop or implement unused transports.
   - Rationale: Improves readability and aligns with common Rust conventions. Current `TransportStdio/TransportStreamableHTTP` is verbose and inconsistent. `SSE` variant is unused.
   - Tradeoffs: Touches serialization; must keep `#[serde(rename = ...)]` stable for settings compatibility. Minor refactors across `match` sites.

2. [ ] Remove boxing in aggregate_tools, simplify lifetimes
   - Goal: Eliminate `Box` allocation in `aggregate_tools` and pass configs without heap indirection.
   - Rationale: Current `let boxed = Box::new(cfg); fetch_tools_for_cfg(&boxed).await` is unconventional and unnecessary. Simplifies code and avoids allocations.
   - Tradeoffs: Might require small signature tweak (pass by value or borrow within the async block). No behavior change.

3. [ ] Unify tool listing behavior and auth handling
   - Goal: Reuse a single helper (current `fetch_tools_for_cfg`) for both server endpoint and Tauri command `mcp_get_client_tools`, including 401 detection that updates overlay flags.
   - Rationale: Prevents divergent behavior and keeps auth UX consistent when a token expires.
   - Tradeoffs: Slight refactor in `main.rs`; tests remain valid.

4. [ ] Reduce duplication in overlay setters
   - Goal: Add an internal `entry_mut(name)` helper to create/get `OverlayEntry` once and set fields, removing repeated default insertion blocks in `overlay.rs`.
   - Rationale: Less repetition, fewer chances of drift if defaults change.
   - Tradeoffs: Internal refactor only; no external API change.

5. [ ] Align listen address between settings and proxy
   - Goal: Either (a) make proxy respect `Settings.listen_addr` (host:port) or (b) remove it from settings and document the fixed `127.0.0.1:8091/mcp` choice.
   - Rationale: Avoids configuration confusion; currently `mcp_listen_addr()` returns settings while the server binds to a fixed port.
   - Tradeoffs: If honoring settings, add parsing + fallback; if removing, a small breaking change in the settings file shape (coordinate with UI).

6. [ ] Consolidate event emissions (avoid duplicates)
   - Goal: Emit `servers_updated` once per logical change in `mcp_toggle_server_enabled` and similar flows.
   - Rationale: Double-emits add noise and can cause racey UI updates.
   - Tradeoffs: Minor behavior change but only reduces redundant events; update tests if they observe counts.

7. [ ] Introduce lightweight error types internally
   - Goal: Replace ad-hoc `Result<T, String>` in internal modules with a small `Error` enum (via `thiserror`). Convert to `String` only at Tauri boundary.
   - Rationale: Clearer error provenance, easier matching (e.g., unauthorized classification), and reduces stringly-typed logic.
   - Tradeoffs: Touches signatures; keep scope tight and avoid over-engineering.

8. [ ] Harden unauthorized detection with typed errors
   - Goal: Replace string contains checks for `"401"`/`"unauthorized"` with structured errors from the transport or our error enum.
   - Rationale: String matching is brittle; typed errors are robust and testable.
   - Tradeoffs: Depends on how `rmcp` exposes errors; may need small wrapper mapping.

9. [ ] Gate heavy e2e test behind env flag or ignore
   - Goal: Mark `e2e_everything` as `#[ignore]` by default and run it when `E2E_ALLOW_NETWORK=1`.
   - Rationale: Avoid flaky CI due to Node/npm availability and network timing while keeping valuable coverage for local runs.
   - Tradeoffs: Slightly less default coverage in CI; document how to opt-in.

10. [ ] Deterministic tool invocation routing
   - Goal: In server `CallToolRequest`, when the tool name is unqualified and multiple servers are enabled, return an error instead of picking an arbitrary enabled server.
   - Rationale: Prevents surprising behavior; nudges clients to use `server::tool`.
   - Tradeoffs: Behavioral change; add a clear error message and tests.

11. [ ] Add focused unit tests for parsing helpers
   - Goal: Test `extract_str` (server.rs) and `to_mcp_tool` across both `inputSchema`/`input_schema` shapes.
   - Rationale: Locks down subtle JSON shape assumptions.
   - Tradeoffs: Pure test additions; no runtime cost.

12. [ ] Minor cleanups spotted by clippy
   - Goal: Remove `let _ = item;`, avoid redundant clones/`into_iter()` on owned vs borrowed, and address common clippy findings.
   - Rationale: Improves clarity and removes dead code.
   - Tradeoffs: No behavior changes; add a `cargo clippy` CI step.

13. [ ] Centralize unauthorized overlay updates
   - Goal: Add `overlay::mark_unauthorized(name)` helper to set `authorization_required=true`, `oauth_authenticated=false`, and optionally clear tools.
   - Rationale: De-duplicates repeated 401 handling scattered in modules.
   - Tradeoffs: Small internal refactor; improves consistency.

14. [ ] Enforce tool toggles server-side (optional)
   - Goal: When aggregating tools, filter out tools disabled by persisted toggles for each server.
   - Rationale: Prevents disabled tools from surfacing in the federated list if UI hides are bypassed.
   - Tradeoffs: Needs a read-path for toggles; ensure cheap IO (cache in memory) and consistent with UI expectations.

15. [ ] Graceful shutdown and client cleanup
   - Goal: Store the proxy server `JoinHandle` and cancel it on app exit; iterate client registry and cancel services.
   - Rationale: Avoids dangling tasks and improves test determinism.
   - Tradeoffs: Add a Tauri `on_window_event`/`on_exit` hook; minor plumbing.

16. [ ] OAuth credentials storage improvement (follow-up)
   - Goal: Migrate from plaintext `oauth.json` to platform keychain (e.g., `keyring` crate) when available, with a plaintext fallback.
   - Rationale: Better security posture for access tokens.
   - Tradeoffs: Platform variance, fallbacks, and migration path; keep opt-in to minimize disruption.

17. [ ] Clarify/remove `TransportType::Sse` (if not planned)
   - Goal: If SSE isn’t supported soon, remove the variant to simplify code; otherwise, implement it end-to-end.
   - Rationale: Dead variants hurt clarity and test matrix.
   - Tradeoffs: Settings compatibility; keep serde rename if deprecating, or add migration.

18. [ ] Settings surface: confirm `listen_addr` usage
   - Goal: If we keep `listen_addr`, ensure UI reads the actual bound addr from backend on startup, not from stale settings.
   - Rationale: Prevents UI drift when port/host differs; aligns with 5.
   - Tradeoffs: Minor UI/backend contract adjustment.

19. [ ] Test helpers deduplication
   - Goal: Extract a shared `TestConfigProvider` into a `tests/common.rs` (or module) to reduce repeated temp-dir boilerplate.
   - Rationale: Consistency and readability across tests.
   - Tradeoffs: Small refactor; keep tests self-contained.

20. [ ] Document event payload contracts
   - Goal: Centralize event names and JSON payload shapes in a doc (and optionally a Rust type) to avoid drift.
   - Rationale: Frontend and backend evolve together; explicit contracts reduce breakage.
   - Tradeoffs: Documentation effort; optional typed payloads add minor code.

