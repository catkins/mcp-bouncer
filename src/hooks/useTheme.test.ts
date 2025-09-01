import { describe, it, expect } from 'vitest';
import { useTheme } from './useTheme';
import React from 'react';
import { createRoot } from 'react-dom/client';

function Harness({ onState }: { onState: (t: any) => void }) {
  const v = useTheme();
  onState(v);
  return null;
}

describe('useTheme', () => {
  it('toggles theme and updates class', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let st: any;
    root.render(<Harness onState={s => (st = s)} />);
    const rootEl = document.documentElement;
    const before = Array.from(rootEl.classList);
    st.toggleTheme();
    const after = Array.from(rootEl.classList);
    expect(before).not.toEqual(after);
  });
});

