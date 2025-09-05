# TODO

Prerequisite: keep CI green across backend/frontend
- Ensure `cargo fmt`, `cargo clippy -D warnings`, and `cargo test` stay clean between frontend tasks. Small backend code hygiene fixes are acceptable to keep the gate green.

1. **Generate shared backend/frontend types**
   - Use `tauri-specta` or `ts-rs` to generate TypeScript definitions and command wrappers from Rust.
   - Removes manual definitions like the ones in `src/tauri/bridge.ts` and keeps bindings in sync.
   - _Trade-off:_ adds a build step and new dependencies.
   - _Test impact:_ enables type-checked mocks in tests and prevents drift, improving coverage of backend contracts.

2. **Validate Tauri invoke responses with schemas**
   - Introduce a library such as `zod` to parse data returned from `invoke` and event payloads.
   - Example: `GetClientTools` currently returns `any[]` without shape guarantees.
   - _Trade-off:_ small runtime cost and an extra dependency.
   - _Test impact:_ unit tests can assert malformed payloads throw, increasing safety.

3. **Enable `noImplicitAny` in TypeScript config**
   - Flip the flag in `tsconfig.json` and add missing annotations.
   - Forces explicit typing and surfaces untyped paths early.
   - _Trade-off:_ initial cleanup across files.
   - _Test impact:_ TypeScript acts as a static test, raising coverage of edge cases.

4. **Refactor `useMCPService` state management**
   - Replace numerous `useState` calls with a reducer or adopt TanStack Query for data + loading/error states.
   - Simplifies logic currently spread across the hook and makes transitions testable.
   - _Trade-off:_ moderate refactor and learning curve for contributors unfamiliar with the library.
   - _Test impact:_ reducer-level tests can target each action, improving coverage of client management flows.

5. **Add tests for `useMCPEvents` lifecycle**
   - Mock `@tauri-apps/api/event` to verify listeners are registered, events trigger loaders, and cleanup cancels timers.
   - _Trade-off:_ additional mocking utilities.
   - _Test impact:_ exercises event-driven paths that are currently untested.

6. **Expand `useIncomingClients` tests**
   - Cover the `reload` function and multiple payload shapes handled by `normalizeConnectedAt`.
   - _Trade-off:_ more test fixtures.
   - _Test impact:_ ensures date normalization logic is protected against regressions.

7. **Add runtime validation at the bridge boundary**
   - Introduce `zod` schemas and validate all `MCPService`/`SettingsService` invoke responses and event payloads.
   - Centralize parsing in `src/tauri/bridge.ts` (or a small wrapper) so hooks/components stay type-safe without `any` casts.
   - _Trade-off:_ small bundle/runtime cost; clearer failures.
   - _Test impact:_ add unit tests for parse failures and happy paths.

8. **Strengthen TypeScript compiler strictness**
   - In addition to `noImplicitAny`, enable: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`.
   - _Trade-off:_ initial cleanup; long-term safety.
   - _Test impact:_ compiler becomes a stronger static test net.

9. **Remove duplicated types and narrow `any`**
   - Deduplicate `IncomingClient` between `hook` and `bridge`; prefer a single exported type.
   - Replace `any` (e.g., `ToolsModal.inputSchema`, casts in `useIncomingClients`) with `unknown` or concrete types.
   - _Trade-off:_ minor refactors across files.
   - _Test impact:_ reduces type gaps in mocks and fixtures.

10. **Accessibility and focus management for modals**
    - Add `role="dialog"`, `aria-modal`, aria labelling, and a lightweight focus trap to `ToolsModal`.
    - Keep Escape-to-close and backdrop click; trap Tab within the modal.
    - _Trade-off:_ a tiny util or helper component.
    - _Test impact:_ RTL tests for focus loop and a11y attributes.

11. **Event subscription helper**
    - Factor the promise-to-unsub pattern used in `useIncomingClients`/`useMCPEvents` into a small utility to standardize safe cleanup.
    - _Trade-off:_ new helper; simpler hooks.
    - _Test impact:_ focused unit tests for subscribe/unsubscribe behavior.

12. **Render performance for large lists**
    - Memoize `ServerCard` rows and consider simple virtualization for Tools list when tool count is high.
    - _Trade-off:_ minor complexity; big wins at scale.
    - _Test impact:_ none required; optional performance assertions.

13. **ESLint (TypeScript + React) setup**
    - Add `eslint`, `@typescript-eslint/*`, `eslint-plugin-react-hooks`, and rules for `no-explicit-any`, `no-console` (warn in dev, error in prod), and import consistency.
    - _Trade-off:_ dev dependency + config.
    - _Test impact:_ catches issues earlier; integrate into CI.

14. **Storybook a11y and interaction testing**
    - Add `@storybook/addon-a11y` and a couple of interaction tests for critical components (ServerForm, ToolsModal).
    - _Trade-off:_ more tooling; helps visual/behavioral regressions.
    - _Test impact:_ improves coverage beyond unit tests.
