import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '../../test/render';
import { useSettingsState } from './useSettingsState';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    SettingsService: {
      ...actual.SettingsService,
      GetSettings: vi.fn(async () => ({ listen_addr: 'http://x', mcp_servers: [], transport: 'unix' })),
      OpenConfigDirectory: vi.fn(async () => {}),
    },
  };
});

import { SettingsService } from '../../tauri/bridge';

function Harness({ onState }: { onState: (s: any) => void }) {
  const state = useSettingsState();
  onState(state);
  return null;
}

describe('useSettingsState', () => {
  it('loads settings and opens config directory', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);

    await waitFor(async () => {
      await st.loadSettings();
      expect(st.settings?.listen_addr).toBe('http://x');
    });

    await st.openConfigDirectory();
    expect(SettingsService.OpenConfigDirectory).toHaveBeenCalled();
  });
});
