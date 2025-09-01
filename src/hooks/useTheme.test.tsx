import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { useTheme } from './useTheme';
import { render } from '../test/render';

function Harness({ onState }: { onState: (t: any) => void }) {
  const v = useTheme();
  onState(v);
  return null;
}

describe('useTheme', () => {
  it('toggles theme and updates class', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);
    await act(async () => {
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
