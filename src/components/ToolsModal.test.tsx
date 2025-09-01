import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

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

afterEach(() => cleanup());

import { ToolsModal } from './ToolsModal';
import { MCPService } from '../tauri/bridge';

describe('ToolsModal', () => {
  it('loads and displays tools', async () => {
    const { findByText, getByText } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    expect(await findByText(/Tools - svc/)).toBeInTheDocument();
    expect(getByText('a')).toBeInTheDocument();
    expect(getByText('b')).toBeInTheDocument();
  });

  it('bulk toggle triggers ToggleTool calls', async () => {
    const { findByText, getByRole } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    await findByText(/Tools - svc/);
    const bulk = getByRole('button', { name: /enable all|disable all/i });
    await userEvent.click(bulk);
    expect((MCPService.ToggleTool as any).mock.calls.length).toBeGreaterThan(0);
  });
});
