import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '../../test/render';
import { useServersState } from './useServersState';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      List: vi.fn(async () => [{
        name: 'svc', description: '', transport: 'stdio', command: 'cmd', args: [], env: {},
        endpoint: '', headers: {}, enabled: true,
      }]),
    },
  };
});

function Harness({ onState }: { onState: (s: any) => void }) {
  const state = useServersState();
  onState(state);
  return null;
}

describe('useServersState', () => {
  it('loads servers', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);
    await st.loadServers();
    await waitFor(() => {
      expect(st.servers.length).toBe(1);
      expect(st.servers[0].name).toBe('svc');
    });
  });
});
