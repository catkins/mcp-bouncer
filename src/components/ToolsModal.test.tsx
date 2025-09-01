import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      GetClientTools: vi.fn(async () => [
        { name: 'a', description: 'A' },
        { name: 'b', description: 'B' },
      ]),
      ToggleTool: vi.fn(async () => {}),
    },
  };
});

import { ToolsModal } from './ToolsModal';
import { MCPService } from '../tauri/bridge';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(el));
  return { container, root };
}

describe('ToolsModal', () => {
  it('loads and displays tools', async () => {
    const { container } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    // Allow effects to run within act
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('Tools - svc');
    expect(container.textContent).toContain('a');
    expect(container.textContent).toContain('b');
  });

  it('bulk toggle triggers ToggleTool calls', async () => {
    const { container } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    const btns = container.querySelectorAll('button');
    const bulk = Array.from(btns).find(b => b.textContent?.includes('Enable All') || b.textContent?.includes('Disable All'))!;
    await act(async () => {
      bulk?.click();
    });
    // 2 tools toggled
    expect((MCPService.ToggleTool as any).mock.calls.length).toBeGreaterThan(0);
  });
});
