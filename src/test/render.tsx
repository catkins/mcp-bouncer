import { render as rtlRender } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

// Generic provider wrapper hook for tests. Extend as needed.
function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function render(ui: ReactElement, options: Parameters<typeof rtlRender>[1] = {}) {
  return rtlRender(ui, { wrapper: Providers as any, ...options });
}

// Re-export everything from RTL for convenience
export * from '@testing-library/react';

