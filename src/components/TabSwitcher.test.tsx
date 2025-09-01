import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TabSwitcher } from './TabSwitcher';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(el);
  return { container, root };
}

describe('TabSwitcher', () => {
  it('renders counts and switches', () => {
    const onChange = vi.fn();
    const { container } = render(
      <TabSwitcher value="servers" onChange={onChange} serverCount={2} clientCount={3} />,
    );
    expect(container.textContent).toContain('2');
    expect(container.textContent).toContain('3');
    const buttons = container.querySelectorAll('button');
    buttons[1].click();
    expect(onChange).toHaveBeenCalledWith('clients');
  });
});

