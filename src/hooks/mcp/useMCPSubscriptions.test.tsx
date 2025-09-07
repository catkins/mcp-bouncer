import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '../../test/render';
import { useMCPSubscriptions } from './useMCPSubscriptions';
import { emit } from '@tauri-apps/api/event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { 
  EVENT_CLIENT_ERROR,
  EVENT_CLIENT_STATUS_CHANGED,
  EVENT_SERVERS_UPDATED,
  EVENT_SETTINGS_UPDATED,
} from '../../tauri/events';

function Harness({ fns }: { fns: Record<string, any> }) {
  useMCPSubscriptions({
    loadServers: fns.loadServers,
    loadActive: fns.loadActive,
    loadSettings: fns.loadSettings,
    loadMcpUrl: fns.loadMcpUrl,
    loadClientStatus: fns.loadClientStatus,
  });
  return null;
}

describe('useMCPSubscriptions', () => {
  it('subscribes to events and fans out loads; cleans up on unmount', async () => {
    mockIPC(() => undefined, { shouldMockEvents: true });

    const fns = {
      loadServers: vi.fn(async () => {}),
      loadActive: vi.fn(async () => {}),
      loadSettings: vi.fn(async () => {}),
      loadMcpUrl: vi.fn(async () => {}),
      loadClientStatus: vi.fn(async () => {}),
    };

    const { unmount } = render(<Harness fns={fns} />);

    // Let effect register listeners and run the initial tick()
    await waitFor(() => expect(fns.loadClientStatus).toHaveBeenCalled());
    vi.clearAllMocks();

    await emit(EVENT_SERVERS_UPDATED, {});
    await waitFor(() => {
      expect(fns.loadServers).toHaveBeenCalledTimes(1);
      expect(fns.loadActive).toHaveBeenCalledTimes(1);
      expect(fns.loadClientStatus).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    await emit(EVENT_SETTINGS_UPDATED, {});
    await waitFor(() => {
      expect(fns.loadSettings).toHaveBeenCalledTimes(1);
      expect(fns.loadMcpUrl).toHaveBeenCalledTimes(1);
      expect(fns.loadServers).toHaveBeenCalledTimes(1);
      expect(fns.loadClientStatus).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    await emit(EVENT_CLIENT_STATUS_CHANGED, {});
    await waitFor(() => {
      expect(fns.loadClientStatus).toHaveBeenCalledTimes(1);
    });

    await emit(EVENT_CLIENT_ERROR, { server_name: 'svc', action: 'x', error: 'e' });
    await waitFor(() => {
      expect(fns.loadClientStatus).toHaveBeenCalledTimes(2);
    });

    // Unmount and verify further emits do not call handlers
    unmount();
    vi.clearAllMocks();
    await emit(EVENT_SERVERS_UPDATED, {});
    // Give time for any stray async handlers (should be none)
    await new Promise(r => setTimeout(r, 0));
    expect(fns.loadServers).not.toHaveBeenCalled();
  });

  afterEach(() => cleanup());
});

