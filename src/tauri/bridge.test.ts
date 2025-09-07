import { describe, it, expect, vi } from 'vitest';

// Mock the generated bindings to simulate success and error results
vi.mock('./bindings', () => {
  return {
    // minimal types for TS
    commands: {
      mcpList: vi.fn(async () => ({ status: 'ok', data: [] })),
      mcpListenAddr: vi.fn(async () => ({ status: 'error', error: 'boom' })),
      settingsGetSettings: vi.fn(async () => ({ status: 'error', error: { message: 'nope' } })),
    },
  } as any;
});

import { MCPService, SettingsService } from './bridge';
import { commands } from './bindings';

describe('bridge unwrap behavior', () => {
  it('returns data on ok', async () => {
    const list = await MCPService.List();
    expect(list).toEqual([]);
  });

  it('throws Error on string error payload', async () => {
    await expect(MCPService.ListenAddr()).rejects.toThrow('boom');
    expect(commands.mcpListenAddr).toHaveBeenCalled();
  });

  it('throws Error on object error payload (stringified)', async () => {
    await expect(SettingsService.GetSettings()).rejects.toThrow(/\{\"message\":\"nope\"/);
    expect(commands.settingsGetSettings).toHaveBeenCalled();
  });
});

