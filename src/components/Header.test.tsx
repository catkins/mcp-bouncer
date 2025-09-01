import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Header } from './Header';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(el));
  return { container, root };
}

describe('Header', () => {
  it('shows MCP URL and calls handlers', async () => {
    const onOpenConfig = vi.fn();
    const toggleTheme = vi.fn();
    const { container } = render(
      <Header
        isActive={true}
        mcpUrl="http://127.0.0.1:8091/mcp"
        onOpenConfig={onOpenConfig}
        theme="light"
        toggleTheme={toggleTheme}
      />,
    );
    expect(container.textContent).toContain('127.0.0.1');
    const configBtn = container.querySelector(
      'button[aria-label="Open config directory"]',
    ) as HTMLButtonElement;
    await act(async () => {
      configBtn?.click();
    });
    expect(onOpenConfig).toHaveBeenCalled();
  });
});
