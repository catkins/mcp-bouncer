import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { useTheme } from './useTheme';
import { createRoot } from 'react-dom/client';

function Harness({ onState }: { onState: (t: any) => void }) {
  const v = useTheme();
  onState(v);
  return null;
}

describe('useTheme', () => {
  it('toggles theme and updates class', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let st: any;
    await act(async () => {
      root.render(<Harness onState={s => (st = s)} />);
      await new Promise(r => setTimeout(r, 0));
    });
    const rootEl = document.documentElement;
    const before = Array.from(rootEl.classList);
    await act(async () => {
      st.toggleTheme();
      await new Promise(r => setTimeout(r, 0));
    });
    const after = Array.from(rootEl.classList);
    expect(before).not.toEqual(after);
  });
});
