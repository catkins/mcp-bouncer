import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '../../test/render';
import { useSettingsState } from './useSettingsState';

vi.mock('../../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../../tauri/bridge');
  return {
    ...actual,
    SettingsService: {
      ...actual.SettingsService,
      GetSettings: vi.fn(async () => ({
        settings: { listen_addr: 'http://x', mcp_servers: [], transport: 'unix' },
        path: '/tmp/settings.json',
      })),
      OpenConfigDirectory: vi.fn(async () => {}),
      UpdateSettings: vi.fn(async () => {}),
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
  it('loads settings, exposes path, updates and opens config directory', async () => {
    let st: any;
    render(<Harness onState={s => (st = s)} />);

    await waitFor(async () => {
      await st.loadSettings();
      expect(st.settings?.listen_addr).toBe('http://x');
      expect(st.settingsPath).toBe('/tmp/settings.json');
    });

    await st.openConfigDirectory();
    expect(SettingsService.OpenConfigDirectory).toHaveBeenCalled();

    await st.updateSettings({ listen_addr: 'http://y', mcp_servers: [], transport: 'tcp' });
    expect(SettingsService.UpdateSettings).toHaveBeenCalledWith({
      listen_addr: 'http://y',
      mcp_servers: [],
      transport: 'tcp',
    });
    await waitFor(() => {
      expect(st.settings?.listen_addr).toBe('http://y');
    });
  });
});
