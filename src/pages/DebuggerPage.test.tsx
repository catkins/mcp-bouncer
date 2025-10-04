import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import DebuggerPage from './DebuggerPage';
import type { MCPServerConfig, ClientStatus, DebugCallToolResponse, Tool } from '../tauri/bridge';
import { MCPService } from '../tauri/bridge';

const connectedStatus: ClientStatus = {
  name: 'server',
  state: 'connected',
  tools: 1,
  authorization_required: false,
  oauth_authenticated: false,
};

const serverConfig: MCPServerConfig = {
  name: 'server',
  description: 'Test server',
  transport: 'stdio',
  command: 'cmd',
  args: [],
  env: {},
  endpoint: '',
  headers: {},
  requires_auth: false,
  enabled: true,
};

describe('DebuggerPage', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(MCPService, 'GetClientTools').mockResolvedValue([]);
    vi.spyOn(MCPService, 'DebugCallTool').mockResolvedValue({
      duration_ms: 0,
      ok: true,
      result: {},
      request_arguments: null,
    });
    vi.spyOn(MCPService, 'RefreshClientTools').mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders empty state when no eligible servers', () => {
    render(
      <DebuggerPage
        servers={[serverConfig]}
        clientStatus={{}}
        eligibleServers={[]}
        selectedServer={null}
        onSelectServer={() => {}}
        statusLoaded
      />,
    );

    expect(
      screen.getByText('No connected servers available for debugging', { exact: false }),
    ).toBeInTheDocument();
  });

  it('submits form payload for a tool call', async () => {
    const tool: Tool = {
      name: 'server::echo',
      description: 'echo tool',
      input_schema: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', description: 'Message to echo' },
        },
      },
    };
    vi.mocked(MCPService.GetClientTools).mockResolvedValue([tool]);
    const response: DebugCallToolResponse = {
      duration_ms: 42,
      ok: true,
      result: { content: [{ type: 'text', text: 'hello' }] },
      request_arguments: { message: 'hello' },
    };
    vi.mocked(MCPService.DebugCallTool).mockResolvedValue(response);

    render(
      <DebuggerPage
        servers={[serverConfig]}
        clientStatus={{ server: connectedStatus }}
        eligibleServers={['server']}
        selectedServer="server"
        onSelectServer={() => {}}
        statusLoaded
      />,
    );

    await waitFor(() => expect(vi.mocked(MCPService.GetClientTools)).toHaveBeenCalledTimes(1));

    const input = await screen.findByLabelText(/message/);
    fireEvent.change(input, { target: { value: 'hello' } });

    const callButton = screen.getByRole('button', { name: /Call Tool/i });
    fireEvent.click(callButton);

    await waitFor(() => {
      expect(vi.mocked(MCPService.DebugCallTool)).toHaveBeenCalledWith('server', 'server::echo', {
        message: 'hello',
      });
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('"message": "hello"');
    });
    expect(screen.getByText(/ok · 42 ms/i)).toBeInTheDocument();
  });

  it('shows empty state when a tool does not require parameters', async () => {
    const tool: Tool = {
      name: 'server::noop',
      description: 'noop tool',
      input_schema: null,
    };
    vi.mocked(MCPService.GetClientTools).mockResolvedValue([tool]);

    render(
      <DebuggerPage
        servers={[serverConfig]}
        clientStatus={{ server: connectedStatus }}
        eligibleServers={['server']}
        selectedServer="server"
        onSelectServer={() => {}}
        statusLoaded
      />,
    );

    await waitFor(() => expect(vi.mocked(MCPService.GetClientTools)).toHaveBeenCalled());

    expect(screen.getByText(/No request parameters needed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Provide JSON payload/i })).toBeInTheDocument();

    const callButton = screen.getByRole('button', { name: /Call Tool/i });
    fireEvent.click(callButton);

    await waitFor(() => {
      expect(vi.mocked(MCPService.DebugCallTool)).toHaveBeenCalledWith('server', 'server::noop', null);
    });
  });

  it('shows empty state when schema has an empty object definition', async () => {
    const tool: Tool = {
      name: 'server::noargs',
      description: 'no args tool',
      input_schema: {
        type: 'object',
        properties: {},
      },
    };
    vi.mocked(MCPService.GetClientTools).mockResolvedValue([tool]);

    render(
      <DebuggerPage
        servers={[serverConfig]}
        clientStatus={{ server: connectedStatus }}
        eligibleServers={['server']}
        selectedServer="server"
        onSelectServer={() => {}}
        statusLoaded
      />,
    );

    await waitFor(() => expect(vi.mocked(MCPService.GetClientTools)).toHaveBeenCalled());

    expect(screen.getByText(/No request parameters needed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Call Tool/i }));

    await waitFor(() => {
      expect(vi.mocked(MCPService.DebugCallTool)).toHaveBeenCalledWith('server', 'server::noargs', null);
    });
  });

  it('surfaces tool error messages when call fails', async () => {
    const tool: Tool = {
      name: 'server::boom',
      description: 'boom tool',
      input_schema: {
        type: 'object',
        required: ['input'],
        properties: {
          input: { type: 'string' },
        },
      },
    };
    vi.mocked(MCPService.GetClientTools).mockResolvedValue([tool]);
    vi.mocked(MCPService.DebugCallTool).mockResolvedValue({
      duration_ms: 10,
      ok: false,
      result: {
        is_error: true,
        content: [{ type: 'text', text: 'tool exploded' }],
      },
      request_arguments: { input: 'boom' },
    });

    render(
      <DebuggerPage
        servers={[serverConfig]}
        clientStatus={{ server: connectedStatus }}
        eligibleServers={['server']}
        selectedServer="server"
        onSelectServer={() => {}}
        statusLoaded
      />,
    );

    await waitFor(() => expect(vi.mocked(MCPService.GetClientTools)).toHaveBeenCalled());

    const input = await screen.findByLabelText(/input/);
    fireEvent.change(input, { target: { value: 'boom' } });
    fireEvent.click(screen.getByRole('button', { name: /call tool/i }));

    await waitFor(() => {
      expect(vi.mocked(MCPService.DebugCallTool)).toHaveBeenCalledWith('server', 'server::boom', {
        input: 'boom',
      });
    });

    expect((await screen.findAllByText('tool exploded'))[0]).toBeInTheDocument();
    expect(screen.getByText(/error · 10 ms/i)).toBeInTheDocument();
  });
});
