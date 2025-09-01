import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ToggleSwitch } from './ToggleSwitch';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(el));
  return { container, root };
}

describe('ToggleSwitch', () => {
  it('calls onChange when toggled', async () => {
    let v = false;
    const { container } = render(
      <ToggleSwitch checked={v} onChange={nv => (v = nv)} label="L" />,
    );
    const btn = container.querySelector('button')!;
    await act(async () => {
      btn.click();
    });
    expect(v).toBe(true);
  });

  it('disabled prevents change', async () => {
    let v = false;
    const { container } = render(
      <ToggleSwitch checked={v} onChange={nv => (v = nv)} disabled label="L" />,
    );
    const btn = container.querySelector('button')!;
    await act(async () => {
      btn.click();
    });
    expect(v).toBe(false);
  });
});
