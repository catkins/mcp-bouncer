import { useEffect, useState } from 'react';
import { MCPService, type IncomingClient as IncomingClientType } from '../tauri/bridge';
import { on, safeUnlisten, EVENT_INCOMING_CLIENT_CONNECTED, EVENT_INCOMING_CLIENT_DISCONNECTED, EVENT_INCOMING_CLIENTS_UPDATED } from '../tauri/events';
import { normalizeConnectedAt } from '../utils/date';
import type { IncomingClientConnectedPayload, IncomingClientDisconnectedPayload } from '../types/events';

export type IncomingClient = IncomingClientType;

export function useIncomingClients() {
  const [clients, setClients] = useState<IncomingClient[]>([]);

  const reload = async () => {
    try {
      const list = await MCPService.GetIncomingClients();
      setClients(
        list.map(item => ({
          ...item,
          connected_at: normalizeConnectedAt(item.connected_at) as string | null,
        })) as IncomingClient[]
      );
    } catch (e) {
      console.error('Failed to load incoming clients', e);
    }
  };

  useEffect(() => {
    reload();

    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const unsub1Promise = on<IncomingClientConnectedPayload>(EVENT_INCOMING_CLIENT_CONNECTED, async (e) => {
      const data = e.payload;
      setClients(prev => {
        const rest = prev.filter(c => c.id !== data.id);
        return [
          ...rest,
          {
            id: data.id,
            name: data.name,
            version: data.version,
            title: data.title,
            connected_at: normalizeConnectedAt(data.connected_at) as string | null,
          },
        ];
      });
    });

    const unsub2Promise = on<IncomingClientDisconnectedPayload>(EVENT_INCOMING_CLIENT_DISCONNECTED, async (e) => {
      const data = e.payload;
      setClients(prev => prev.filter(c => c.id !== data.id));
    });

    const unsub3Promise = on(EVENT_INCOMING_CLIENTS_UPDATED, async () => {
      await reload();
    });

    // capture unsubs when ready; if already cancelled, unlisten immediately
    unsub1Promise.then(u => (cancelled ? (void safeUnlisten(u)) : unsubs.push(u))).catch(() => {});
    unsub2Promise.then(u => (cancelled ? (void safeUnlisten(u)) : unsubs.push(u))).catch(() => {});
    unsub3Promise.then(u => (cancelled ? (void safeUnlisten(u)) : unsubs.push(u))).catch(() => {});

    return () => {
      cancelled = true;
      while (unsubs.length) {
        const u = unsubs.pop();
        if (u) safeUnlisten(u);
      }
    };
  }, []);

  return { clients, reload };
}
