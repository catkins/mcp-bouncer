// Centralized event names and payload typings

export const EventsMap = {
  ServersUpdated: 'mcp:servers_updated',
  SettingsUpdated: 'settings:updated',
  ClientStatusChanged: 'mcp:client_status_changed',
  ClientError: 'mcp:client_error',
  IncomingClientConnected: 'mcp:incoming_client_connected',
  IncomingClientDisconnected: 'mcp:incoming_client_disconnected',
  IncomingClientsUpdated: 'mcp:incoming_clients_updated',
} as const;

export type EventName = (typeof EventsMap)[keyof typeof EventsMap];

export interface ClientErrorPayload {
  server_name: string;
  action: string;
  error: string;
}

export interface IncomingClientConnectedPayload {
  id: string;
  name: string;
  version: string;
  title?: string;
  connected_at: string | Date | { Time?: string } | null;
}

export interface IncomingClientDisconnectedPayload {
  id: string;
}

// Generic wrapper used by our Events.On bridge
export interface TauriEvent<T = unknown> {
  data: T;
}

