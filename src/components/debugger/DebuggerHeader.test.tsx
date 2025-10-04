import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
import { DebuggerHeader } from './DebuggerHeader';
import type { ClientStatus } from '../../tauri/bridge';

const connectedStatus: ClientStatus = {
  name: 'server-a',
  state: 'connected',
  tools: 4,
  authorization_required: false,
  oauth_authenticated: false,
};

describe('DebuggerHeader', () => {
  it('renders selected server information and status', () => {
    const { getByText } = render(
      <DebuggerHeader
        selectedServer="server-a"
        serverOptions={[{ name: 'server-a', description: 'Example server' }]}
        status={connectedStatus}
        serverEligible
        onSelectServer={() => {}}
      />,
    );

    const header = getByText('Tool Debugger').closest('div');
    expect(header).toBeTruthy();
    const scoped = within(header as HTMLElement);
    expect(scoped.getByText('server-a')).toBeInTheDocument();
    expect(screen.getByText(/Connected · 4 tools/i)).toBeInTheDocument();
  });

  it('invokes onSelectServer when a new option is chosen', () => {
    const handleSelect = vi.fn();
    render(
      <DebuggerHeader
        selectedServer={null}
        serverOptions={[
          { name: 'server-a', description: 'Server A' },
          { name: 'server-b', description: 'Server B' },
        ]}
        serverEligible={false}
        onSelectServer={handleSelect}
      />,
    );

    const { container } = render(
      <DebuggerHeader
        selectedServer={null}
        serverOptions={[
          { name: 'server-a', description: 'Server A' },
          { name: 'server-b', description: 'Server B' },
        ]}
        serverEligible={false}
        onSelectServer={handleSelect}
      />,
    );

    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'server-b' } });

    expect(handleSelect).toHaveBeenCalledWith('server-b');
  });

  it('shows warning badge when server is not eligible', () => {
    const { getByText, getAllByText } = render(
      <DebuggerHeader
        selectedServer="server-a"
        serverOptions={[{ name: 'server-a', description: 'Server A' }]}
        status={{ ...connectedStatus, state: 'disconnected' }}
        serverEligible={false}
        onSelectServer={() => {}}
      />,
    );

    expect(getByText('Tool Debugger')).toBeInTheDocument();
    expect(getAllByText(/Not connected/i)[0]).toBeInTheDocument();
  });
});
