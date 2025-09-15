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
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// Extend expect with jest-dom matchers for better DOM assertions
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';

// Provide a baseline IPC mock so `invoke` calls are intercepted in tests.
beforeEach(() => {
  mockIPC(() => undefined);
});

afterEach(() => {
  clearMocks();
});

// Silence console warnings/errors from optimistic updates and mocked backends
console.warn = vi.fn();
console.error = vi.fn();
