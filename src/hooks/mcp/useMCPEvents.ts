import { useEffect } from 'react';
import { Events } from '../../tauri/bridge';
import { EventsMap, type ClientErrorPayload, type TauriEvent } from '../../types/events';

export function useMCPEvents(
  deps: {
    loadServers: () => Promise<void>;
    loadActive: () => Promise<void>;
    loadSettings: () => Promise<void>;
    loadMcpUrl: () => Promise<void>;
    loadClientStatus: () => Promise<void>;
    setToggleError: (serverName: string, error?: string) => void;
  },
) {
  useEffect(() => {
    const onServersUpdated = Events.On(EventsMap.ServersUpdated, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:servers_updated event:', event);
      await deps.loadServers();
      await deps.loadActive();
      await deps.loadClientStatus();
    });

    const onSettingsUpdated = Events.On(EventsMap.SettingsUpdated, async (event) => {
      if (import.meta.env.DEV) console.log('Received settings:updated event:', event);
      await deps.loadSettings();
      await deps.loadMcpUrl();
      await deps.loadServers();
      await deps.loadClientStatus();
    });

    const onClientStatusChanged = Events.On(EventsMap.ClientStatusChanged, async (event) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_status_changed event:', event);
      await deps.loadClientStatus();
    });

    const onClientError = Events.On(EventsMap.ClientError, async (event: TauriEvent<ClientErrorPayload>) => {
      if (import.meta.env.DEV) console.log('Received mcp:client_error event:', event);
      const data = event.data;
      if (data && data.server_name) {
        deps.setToggleError(data.server_name, `${data.action} failed: ${data.error}`);
        await deps.loadClientStatus();
      }
    });

    // Poll client status every 5s as a safety net
    let cancelled = false;
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
      onServersUpdated();
      onSettingsUpdated();
      onClientStatusChanged();
      onClientError();
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [deps]);
}

