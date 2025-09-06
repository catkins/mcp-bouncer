import { useEffect } from 'react';
import { on, safeUnlisten, EVENT_CLIENT_ERROR, EVENT_CLIENT_STATUS_CHANGED, EVENT_SERVERS_UPDATED, EVENT_SETTINGS_UPDATED } from '../../tauri/events';
import type { ClientErrorPayload } from '../../types/events';

export function useMCPSubscriptions(opts: {
  loadServers: () => Promise<void>;
  loadActive: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadMcpUrl: () => Promise<void>;
  loadClientStatus: () => Promise<void>;
  clearToggleLoading?: (serverName: string) => void;
  clearRestartLoading?: (serverName: string) => void;
  setToggleError: (serverName: string, error?: string) => void;
}) {
  const { loadServers, loadActive, loadSettings, loadMcpUrl, loadClientStatus, clearToggleLoading, clearRestartLoading, setToggleError } = opts;

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    on(EVENT_SERVERS_UPDATED, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:servers_updated event:', event);
      await loadServers();
      await loadActive();
      await loadClientStatus();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on(EVENT_SETTINGS_UPDATED, async (event) => {
      if (import.meta.env.DEV) console.log('Received settings:updated event:', event);
      await loadSettings();
      await loadMcpUrl();
      await loadServers();
      await loadClientStatus();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on(EVENT_CLIENT_STATUS_CHANGED, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_status_changed event:', event);
      await loadClientStatus();
      const payload = (event?.payload || {}) as { server_name?: string; action?: string };
      const server = payload.server_name;
      const action = (payload.action || '').toLowerCase();
      if (server && (action === 'connected' || action === 'disable' || action === 'error')) {
        clearToggleLoading?.(server);
        clearRestartLoading?.(server);
      }
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on<ClientErrorPayload>(EVENT_CLIENT_ERROR, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_error event:', event);
      const data = event.payload;
      if (data && data.server_name) {
        setToggleError(data.server_name, `${data.action} failed: ${data.error}`);
        await loadClientStatus();
      }
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    // Poll client status every 5s as a safety net
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (!cancelled) await loadClientStatus();
      } finally {
        ticking = false;
      }
    };
    const intervalId = setInterval(tick, 5000);
    tick();

    return () => {
      cancelled = true;
      // drain and unlisten safely
      while (unsubs.length) {
        const u = unsubs.pop();
        if (u) safeUnlisten(u);
      }
      clearInterval(intervalId);
    };
  }, [
    loadServers,
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus,
    setToggleError,
    clearToggleLoading,
    clearRestartLoading,
  ]);
}

