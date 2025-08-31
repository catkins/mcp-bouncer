import { useEffect, useState } from 'react';
import { Events } from '@wailsio/runtime';
import { MCPService } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp';

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
          connected_at:
            typeof item.connected_at === 'string' || item.connected_at instanceof Date
              ? item.connected_at
              : item.connected_at && item.connected_at.Time
                ? item.connected_at.Time
                : item.connected_at,
        })),
      );
    } catch (e) {
      console.error('Failed to load incoming clients', e);
    }
  };

  useEffect(() => {
    reload();

    const unsub1 = Events.On('mcp:incoming_client_connected', async (e: Events.WailsEvent) => {
      const data = e.data as any;
      setClients(prev => {
        const rest = prev.filter(c => c.id !== data.id);
        return [
          ...rest,
          {
            id: data.id,
            name: data.name,
            version: data.version,
            title: data.title,
            connected_at:
              typeof data.connected_at === 'string'
                ? data.connected_at
                : new Date(data.connected_at).toISOString(),
          },
        ];
      });
    });

    const unsub2 = Events.On('mcp:incoming_client_disconnected', async (e: Events.WailsEvent) => {
      const data = e.data as any;
      setClients(prev => prev.filter(c => c.id !== data.id));
    });

    const unsub3 = Events.On('mcp:incoming_clients_updated', async (e: Events.WailsEvent) => {
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
