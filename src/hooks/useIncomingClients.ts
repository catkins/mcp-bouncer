import { useEffect, useState } from 'react';
import { MCPService } from '../tauri/bridge';
import { listen } from '@tauri-apps/api/event';
import { normalizeConnectedAt } from '../utils/date';
import { EventsMap, type IncomingClientConnectedPayload, type IncomingClientDisconnectedPayload } from '../types/events';

export type IncomingClient = {
  id: string;
  name: string;
  version: string;
  title?: string;
  connected_at: string | Date | null;
};

export function useIncomingClients() {
  const [clients, setClients] = useState<IncomingClient[]>([]);

  const reload = async () => {
    try {
      const list = (await MCPService.GetIncomingClients()) as any[];
      setClients(
        list.map(item => ({
          ...item,
          connected_at: normalizeConnectedAt(item.connected_at),
        })),
      );
    } catch (e) {
      console.error('Failed to load incoming clients', e);
    }
  };

  useEffect(() => {
    reload();

    const unsub1Promise = listen<IncomingClientConnectedPayload>(EventsMap.IncomingClientConnected, async (e) => {
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
            connected_at: normalizeConnectedAt(data.connected_at),
          },
        ];
      });
    });

    const unsub2Promise = listen<IncomingClientDisconnectedPayload>(EventsMap.IncomingClientDisconnected, async (e) => {
      const data = e.payload;
      setClients(prev => prev.filter(c => c.id !== data.id));
    });

    const unsub3Promise = listen(EventsMap.IncomingClientsUpdated, async () => {
      await reload();
    });

    return () => {
      // Best-effort unsubscribe once listeners are registered
      unsub1Promise.then(u => u()).catch(() => {});
      unsub2Promise.then(u => u()).catch(() => {});
      unsub3Promise.then(u => u()).catch(() => {});
    };
  }, []);

  return { clients, reload };
}
