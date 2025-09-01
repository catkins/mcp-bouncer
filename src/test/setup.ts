// Vitest setup: polyfills for DOM APIs used in components/hooks

if (typeof window !== 'undefined' && !('matchMedia' in window)) {
  // Basic matchMedia stub for useTheme hook
  // @ts-expect-error - adding missing API in JSDOM
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Let React know the environment supports `act`
// See https://react.dev/reference/test-utils/act#js-dom
// and React 19 guidance for non-RTL setups.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// Extend expect with jest-dom matchers for better DOM assertions
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Tauri APIs to avoid event/invoke noise in tests
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, _cb: any) => {
    // return unsubscribe
    return () => {};
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd: string, _args?: any) => undefined),
}));

// Silence console warnings/errors from optimistic updates and mocked backends
console.warn = vi.fn();
console.error = vi.fn();
