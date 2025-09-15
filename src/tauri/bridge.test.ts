import { describe, it, expect, vi } from 'vitest';

// Mock invoke to simulate success and error results
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string) => {
      if (cmd === 'mcp_list') return [];
      if (cmd === 'mcp_listen_addr') throw new Error('boom');
      if (cmd === 'settings_get_settings') throw new Error(JSON.stringify({ message: 'nope' }));
      return null;
    }),
  } as any;
});

import { MCPService, SettingsService } from './bridge';
import { invoke } from '@tauri-apps/api/core';

describe('bridge unwrap behavior', () => {
  it('returns data on ok', async () => {
    const list = await MCPService.List();
    expect(list).toEqual([]);
  });

  it('throws Error on string error payload', async () => {
    await expect(MCPService.ListenAddr()).rejects.toThrow('boom');
    expect(invoke).toHaveBeenCalledWith('mcp_listen_addr');
  });

  it('throws Error on object error payload (stringified)', async () => {
    await expect(SettingsService.GetSettings()).rejects.toThrow(/\{\"message\":\"nope\"/);
    expect(invoke).toHaveBeenCalledWith('settings_get_settings');
  });
});
