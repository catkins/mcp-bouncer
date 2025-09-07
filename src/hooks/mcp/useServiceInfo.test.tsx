import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '../../test/render';
import { useServiceInfo } from './useServiceInfo';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      ListenAddr: vi.fn(async () => 'http://127.0.0.1:8091/mcp'),
      IsActive: vi.fn(async () => true),
    },
  };
});

function Harness({ onState }: { onState: (s: any) => void }) {
  const state = useServiceInfo();
  onState(state);
  return null;
}

describe('useServiceInfo', () => {
  it('loads listen addr and active state', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);
    await st.loadMcpUrl();
    await st.loadActive();
    await waitFor(() => {
      expect(st.mcpUrl).toMatch(/8091\/mcp/);
      expect(st.isActive).toBe(true);
    });
  });
});

