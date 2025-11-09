import { useEffect, useRef } from 'react';
import { on, safeUnlisten, EVENT_CLIENT_ERROR, EVENT_CLIENT_STATUS_CHANGED, EVENT_SERVERS_UPDATED, EVENT_SETTINGS_UPDATED } from '../../tauri/events';
import type { ClientErrorPayload } from '../../types/events';

type Loads = {
  loadServers: () => Promise<void>;
  loadActive: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadMcpUrl: () => Promise<void>;
  loadClientStatus: () => Promise<void>;
  loadSocketBridgePath?: () => Promise<void>;
};

export function useMCPSubscriptions(opts: Loads) {
  const loadsRef = useRef<Loads>(opts);
  // keep latest callbacks without retriggering subscriptions
  useEffect(() => {
    loadsRef.current = opts;
  }, [opts]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    let cancelled = false;

    on(EVENT_SERVERS_UPDATED, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:servers_updated event:', event);
      const { loadServers, loadActive, loadClientStatus, loadSocketBridgePath } = loadsRef.current;
      await loadServers();
      await loadActive();
      await loadClientStatus();
      if (loadSocketBridgePath) await loadSocketBridgePath();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on(EVENT_SETTINGS_UPDATED, async (event) => {
      if (import.meta.env.DEV) console.log('Received settings:updated event:', event);
      const {
        loadSettings,
        loadMcpUrl,
        loadServers,
        loadClientStatus,
        loadSocketBridgePath,
      } = loadsRef.current;
      await loadSettings();
      await loadMcpUrl();
      await loadServers();
      await loadClientStatus();
      if (loadSocketBridgePath) await loadSocketBridgePath();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on(EVENT_CLIENT_STATUS_CHANGED, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_status_changed event:', event);
      const { loadClientStatus } = loadsRef.current;
      await loadClientStatus();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    on<ClientErrorPayload>(EVENT_CLIENT_ERROR, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_error event:', event);
      const { loadClientStatus } = loadsRef.current;
      await loadClientStatus();
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});

    // Poll client status every 5s as a safety net
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (!cancelled) await loadsRef.current.loadClientStatus();
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
  }, []);
}
