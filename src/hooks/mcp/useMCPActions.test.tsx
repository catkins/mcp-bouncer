import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { render } from '../../test/render';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      UpdateMCPServer: vi.fn(async () => {}),
      AddMCPServer: vi.fn(async () => {}),
    },
  };
});

import { useMCPActions } from './useMCPActions';
import { MCPService } from '../../tauri/bridge';

function Harness({ servers, onState, loadClientStatus = async () => {}, loadServers = async () => {} }: any) {
  const [list, setList] = React.useState(servers);
  const [errors, setErrors] = React.useState<any>({});
  const [loading, setLoading] = React.useState<any>({
    addServer: false,
    updateServer: false,
    removeServer: false,
    general: false,
    restartServer: {},
    toggleServer: {},
  });
  const actions = useMCPActions({
    servers: list,
    setServers: (u: any) => setList((p: any) => u(p)),
    setLoadingStates: (u: any) => setLoading((p: any) => u(p)),
    setErrors: (u: any) => setErrors((p: any) => u(p)),
    loadClientStatus,
    loadServers,
  });
  onState({ list, errors, loading, actions, setList });
  return null;
}

describe('useMCPActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically toggles and reverts on error', async () => {
    let st: any;
    render(
      <Harness
        servers={[
          { name: 'svc', description: '', transport: 'stdio', command: 'cmd', enabled: false },
        ]}
        onState={(s: any) => (st = s)}
      />,
    );

    // Cause backend to fail
    ;(MCPService.UpdateMCPServer as any).mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    await act(async () => {
      await st.actions.toggleServer('svc', true).catch(() => {});
    });
    // Reverted to false
    expect(st.list.find((s: any) => s.name === 'svc').enabled).toBe(false);
  });

  it('loads client status after adding a server', async () => {
    const loadServers = vi.fn(async () => {});
    const loadClientStatus = vi.fn(async () => {});
    let st: any;
    render(
      <Harness
        servers={[]}
        onState={(s: any) => (st = s)}
        loadServers={loadServers}
        loadClientStatus={loadClientStatus}
      />,
    );

    const config = {
      name: 'new-svc',
      description: '',
      transport: 'stdio',
      command: 'cmd',
      enabled: true,
    };

    await act(async () => {
      await st.actions.addServer(config);
    });

    expect(MCPService.AddMCPServer).toHaveBeenCalledWith(config);
    expect(loadServers).toHaveBeenCalledTimes(1);
    expect(loadClientStatus).toHaveBeenCalledTimes(1);
  });
});
