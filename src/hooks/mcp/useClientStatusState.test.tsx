import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '../../test/render';
import { useClientStatusState } from './useClientStatusState';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      GetClientStatus: vi.fn(async () => ({ svc: { name: 'svc', state: 'connected', tools: 1, authorization_required: false, oauth_authenticated: false } })),
    },
  };
});

function Harness({ onState }: { onState: (s: any) => void }) {
  const state = useClientStatusState();
  onState(state);
  return null;
}

describe('useClientStatusState', () => {
  it('loads client status', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);
    await st.loadClientStatus();
    await waitFor(() => {
      expect(st.clientStatus.svc.state).toBe('connected');
    });
  });
});

