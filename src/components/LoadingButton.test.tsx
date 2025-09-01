import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LoadingButton } from './LoadingButton';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(el);
  return { container, root };
}

describe('LoadingButton', () => {
  it('invokes onClick', async () => {
    let called = 0;
    const { container } = render(
      <LoadingButton onClick={() => (called += 1)}>Go</LoadingButton>,
    );
    const btn = container.querySelector('button')!;
    btn.click();
    expect(called).toBe(1);
  });

  it('disabled prevents click', () => {
    let called = 0;
    const { container } = render(
      <LoadingButton disabled onClick={() => (called += 1)}>
        Go
      </LoadingButton>,
    );
    container.querySelector('button')!.click();
    expect(called).toBe(0);
  });
});

