import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { EventsMap, type ClientErrorPayload } from '../../types/events';

export function useMCPEvents(
  deps: {
    loadServers: () => Promise<void>;
    loadActive: () => Promise<void>;
    loadSettings: () => Promise<void>;
    loadMcpUrl: () => Promise<void>;
    loadClientStatus: () => Promise<void>;
    setToggleError: (serverName: string, error?: string) => void;
    clearToggleLoading?: (serverName: string) => void;
    clearRestartLoading?: (serverName: string) => void;
  },
) {
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    listen(EventsMap.ServersUpdated, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:servers_updated event:', event);
      await deps.loadServers();
      await deps.loadActive();
      await deps.loadClientStatus();
    }).then(u => (cancelled ? u() : unsubs.push(u)));

    listen(EventsMap.SettingsUpdated, async (event) => {
      if (import.meta.env.DEV) console.log('Received settings:updated event:', event);
      await deps.loadSettings();
      await deps.loadMcpUrl();
      await deps.loadServers();
      await deps.loadClientStatus();
    }).then(u => (cancelled ? u() : unsubs.push(u)));

    listen(EventsMap.ClientStatusChanged, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_status_changed event:', event);
      await deps.loadClientStatus();
      const payload = (event?.payload || {}) as { server_name?: string; action?: string };
      const server = payload.server_name;
      const action = (payload.action || '').toLowerCase();
      if (server && (action === 'connected' || action === 'disable' || action === 'error')) {
        deps.clearToggleLoading?.(server);
        deps.clearRestartLoading?.(server);
      }
    }).then(u => (cancelled ? u() : unsubs.push(u)));

    listen<ClientErrorPayload>(EventsMap.ClientError, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_error event:', event);
      const data = event.payload;
      if (data && data.server_name) {
        deps.setToggleError(data.server_name, `${data.action} failed: ${data.error}`);
        await deps.loadClientStatus();
      }
    }).then(u => (cancelled ? u() : unsubs.push(u)));

    // Poll client status every 5s as a safety net
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (!cancelled) await deps.loadClientStatus();
      } finally {
        ticking = false;
      }
    };
    const intervalId = setInterval(tick, 5000);
    tick();

    return () => {
      cancelled = true;
      unsubs.forEach(u => u());
      clearInterval(intervalId);
    };
  }, [deps]);
}
