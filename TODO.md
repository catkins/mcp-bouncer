# TODO

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
