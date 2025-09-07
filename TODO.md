# TODO (Frontend TypeScript)

Prerequisite: keep CI green across backend/frontend
- [ ] Ensure `npm run build` and `npm run test:run` pass locally before commits
- [ ] Keep Rust CI green: `cargo fmt`, `cargo clippy -D warnings`, `cargo test` (backend-only fixes OK to keep gate green)

Quality, safety, and coverage improvements
- [x] Generate shared backend/frontend types via `tauri-specta` (see `src/tauri/bindings.ts` usage in `bridge.ts`)
- [ ] Improve generated types via specta: review `specta`/`tauri-specta` feature flags (e.g., `chrono`), annotate Rust types to narrow optionals, and regen bindings
- [x] Enable `noImplicitAny` and `strict` in `tsconfig.json`
- [ ] Strengthen TS strictness: enable `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`
- [ ] Add ESLint (TypeScript + React) with sensible rules (`no-explicit-any`, `react-hooks/exhaustive-deps`, no console in prod) and wire into CI
- [ ] Remove remaining `any` in app code paths; prefer `unknown` or concrete types
- [ ] Prefer narrowing at the bridge boundary using generated types and Rust-side validation (no `zod`)

Hooks, state, and events
- [ ] Add tests for `useMCPSubscriptions` lifecycle (register/unregister listeners, 5s polling, handler fan-out)
- [x] Expand `useIncomingClients` tests to cover varied timestamp shapes and disconnect handling
- [ ] Consolidate duplicate server action hooks (`useServerActions` vs `useMCPActions`) into a single, typed hook with optional loading/error state wiring

Components and a11y
- [x] Accessibility and focus management for `ToolsModal` (dialog role, aria-modal, labelledby/describedby, focus trap, Escape)
- [ ] Add `@storybook/addon-a11y` and basic interaction tests for `ServerForm` and `ToolsModal`
- [ ] Consider virtualization/memoization for large tool lists if performance becomes an issue

Testing
- [ ] Add negative-path tests for bridge parsing (malformed payloads throw)
- [ ] Increase coverage on complex flows: toggling servers, OAuth start, restart error paths
- [ ] Keep test output clean (no warnings/noise) and expand fixtures where helpful

Notes discovered during review
- Duplicate hooks for server actions exist (`useServerActions` and `useMCPActions`); unify to avoid drift.
- Bridge `unwrap` uses loose casts; tighten typing and remove `as any`. [Done]
- Narrow `any` in `normalizeConnectedAt` and `useIncomingClients` to `unknown` and handle precisely. [Done]
- For stronger typing, push precision into Rust types and specta derivations (including `chrono` integration) and regenerate bindings.
