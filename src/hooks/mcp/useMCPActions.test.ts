import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      UpdateMCPServer: vi.fn(async () => {}),
    },
  };
});

import { useMCPActions } from './useMCPActions';
import { MCPService } from '../../tauri/bridge';

function Harness({ servers, onState }: any) {
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
    loadClientStatus: async () => {},
    loadServers: async () => {},
  });
  onState({ list, errors, loading, actions, setList });
  return null;
}

describe('useMCPActions', () => {
  it('optimistically toggles and reverts on error', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let st: any;
    root.render(
      <Harness
        servers={[{ name: 'svc', description: '', transport: 'stdio', command: 'cmd', enabled: false }]}
        onState={(s: any) => (st = s)}
      />,
    );

    // Cause backend to fail
    (MCPService.UpdateMCPServer as any).mockImplementationOnce(async () => {
      throw new Error('boom');
    });

    await st.actions.toggleServer('svc', true).catch(() => {});
    // Reverted to false
    expect(st.list.find((s: any) => s.name === 'svc').enabled).toBe(false);
  });
});

