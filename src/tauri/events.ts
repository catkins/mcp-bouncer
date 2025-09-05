import { listen, type Event } from '@tauri-apps/api/event';
import type { EventName } from '../types/events';

export type Unlisten = () => void | Promise<void>;

export async function on<T = unknown>(name: EventName, handler: (event: Event<T>) => void | Promise<void>): Promise<Unlisten> {
  return listen<T>(name as string, handler);
}

export function safeUnlisten(u?: Unlisten) {
  if (!u) return;
  try {
    const maybe: any = u();
    if (maybe && typeof maybe.catch === 'function') (maybe as Promise<void>).catch(() => {});
  } catch {
    // noop
  }
}

export { 
  EVENT_SERVERS_UPDATED,
  EVENT_SETTINGS_UPDATED,
  EVENT_CLIENT_STATUS_CHANGED,
  EVENT_CLIENT_ERROR,
  EVENT_INCOMING_CLIENT_CONNECTED,
  EVENT_INCOMING_CLIENT_DISCONNECTED,
  EVENT_INCOMING_CLIENTS_UPDATED,
} from '../types/events';

