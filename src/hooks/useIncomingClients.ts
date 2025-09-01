import { useEffect, useState } from 'react';
import { Events, MCPService } from '../tauri/bridge';
import { normalizeConnectedAt } from '../utils/date';
import {
  EventsMap,
  type IncomingClientConnectedPayload,
  type IncomingClientDisconnectedPayload,
  type TauriEvent,
} from '../types/events';

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

    const unsub1 = Events.On(EventsMap.IncomingClientConnected, async (e: TauriEvent<IncomingClientConnectedPayload>) => {
      const data = e.data;
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

    const unsub2 = Events.On(EventsMap.IncomingClientDisconnected, async (e: TauriEvent<IncomingClientDisconnectedPayload>) => {
      const data = e.data;
      setClients(prev => prev.filter(c => c.id !== data.id));
    });

    const unsub3 = Events.On(EventsMap.IncomingClientsUpdated, async () => {
      await reload();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  return { clients, reload };
}
