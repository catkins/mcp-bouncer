import { describe, it, expect, vi } from 'vitest';
import { render } from '../test/render';
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
    const { findByRole, getByText } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    expect(await findByRole('dialog', { name: /tools - svc/i })).toBeInTheDocument();
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

  it('shows error and reverts state when toggle fails', async () => {
    const { findByRole, getAllByRole, findByText } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={() => {}} />,
    );
    await findByRole('dialog', { name: /tools - svc/i });
    // Cause ToggleTool to throw
    ;(MCPService.ToggleTool as any).mockImplementationOnce(async () => {
      throw new Error('nope');
    });
    // Click first toggle
    const toggles = getAllByRole('button', { name: /toggle switch/i });
    await userEvent.click(toggles[0]!);
    // Error message appears
    expect(await findByText(/failed to toggle tools?|nope/i)).toBeInTheDocument();
  });

  it('exposes dialog role and traps focus; Escape closes', async () => {
    const onClose = vi.fn();
    const { findByRole } = render(
      <ToolsModal serverName="svc" isOpen={true} onClose={onClose} />,
    );
    const dialog = await findByRole('dialog', { name: /tools - svc/i });
    expect(dialog).toBeInTheDocument();

    // initial focus lands on the close button (data-initial-focus)
    const active = document.activeElement as HTMLElement;
    expect(active?.getAttribute('aria-label') || '').toMatch(/close tools modal/i);

    // Press Escape closes
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
