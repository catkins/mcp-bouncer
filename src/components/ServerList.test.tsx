import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, fireEvent } from '../test/render';
import { ServerList } from './ServerList';

// Mock bridge for ToolsModal to avoid real fetches
vi.mock('../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      GetClientTools: vi.fn(async () => []),
    },
  };
});

describe('ServerList', () => {
  const servers = [
    {
      name: 'svc', description: '', transport: 'stdio', command: 'cmd', args: [], env: {},
      endpoint: '', headers: {}, requires_auth: false, enabled: true,
    },
  ];

  const status = {
    svc: { name: 'svc', state: 'connected', tools: 2, authorization_required: false, oauth_authenticated: false },
  } as const;

  it('opens add form and tools modal, toggles server', async () => {
    const onAddServer = vi.fn(async () => {});
    const onUpdateServer = vi.fn(async () => {});
    const onRemoveServer = vi.fn(async () => {});
    const onToggleServer = vi.fn(async () => {});
    const onRestartServer = vi.fn(async () => {});
    const onAuthorizeServer = vi.fn(async () => {});

    render(
      <ServerList
        servers={servers as any}
        clientStatus={status as any}
        onAddServer={onAddServer}
        onUpdateServer={onUpdateServer}
        onRemoveServer={onRemoveServer}
        onToggleServer={onToggleServer}
        onRestartServer={onRestartServer}
        onAuthorizeServer={onAuthorizeServer}
      />,
    );

    // Add Server button opens form
    await userEvent.click(screen.getAllByRole('button', { name: /add server/i })[0]!);
    expect(await screen.findByText(/Transport Type/)).toBeInTheDocument();

    // Tools button opens modal (tools count is a button)
    const toolsBtn = await screen.findByRole('button', { name: /open tools for svc/i });
    await userEvent.click(toolsBtn);
    expect(await screen.findByRole('dialog', { name: /Tools - svc/i })).toBeInTheDocument();

    // Toggle
    const toggles = await screen.findAllByRole('button', { name: /toggle switch/i });
    await userEvent.click(toggles[0]!);
    await waitFor(() => {
      expect(onToggleServer).toHaveBeenCalled();
    });
  });

  it('calls restart and authorize handlers', async () => {
    const onAddServer = vi.fn(async () => {});
    const onUpdateServer = vi.fn(async () => {});
    const onRemoveServer = vi.fn(async () => {});
    const onToggleServer = vi.fn(async () => {});
    const onRestartServer = vi.fn(async () => {});
    const onAuthorizeServer = vi.fn(async () => {});

    // First render to hit restart
    const { rerender } = render(
      <ServerList
        servers={servers as any}
        clientStatus={status as any}
        onAddServer={onAddServer}
        onUpdateServer={onUpdateServer}
        onRemoveServer={onRemoveServer}
        onToggleServer={onToggleServer}
        onRestartServer={onRestartServer}
        onAuthorizeServer={onAuthorizeServer}
      />,
    );

    const restartBtns = await screen.findAllByRole('button', { name: /restart svc/i });
    fireEvent.click(restartBtns[0]!);
    await waitFor(() => expect(onRestartServer).toHaveBeenCalled());

    // Rerender with streamable_http + requires authorization state
    const authServers = [
      {
        name: 'svc', description: '', transport: 'streamable_http', command: 'cmd', args: [], env: {},
        endpoint: 'http://localhost', headers: {}, requires_auth: true, enabled: true,
      },
    ];
    const authStatus = {
      svc: { name: 'svc', state: 'requires_authorization', tools: 0, authorization_required: true, oauth_authenticated: false },
    } as const;

    rerender(
      <ServerList
        servers={authServers as any}
        clientStatus={authStatus as any}
        onAddServer={onAddServer}
        onUpdateServer={onUpdateServer}
        onRemoveServer={onRemoveServer}
        onToggleServer={onToggleServer}
        onRestartServer={onRestartServer}
        onAuthorizeServer={onAuthorizeServer}
      />,
    );

    const authorizeChip = await screen.findByRole('button', { name: /authorize svc/i });
    await userEvent.click(authorizeChip);
    expect(onAuthorizeServer).toHaveBeenCalled();
  });
});
