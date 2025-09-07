// Centralized event names and payload typings
export const EVENT_SERVERS_UPDATED = 'mcp:servers_updated' as const;
export const EVENT_SETTINGS_UPDATED = 'settings:updated' as const;
export const EVENT_CLIENT_STATUS_CHANGED = 'mcp:client_status_changed' as const;
export const EVENT_CLIENT_ERROR = 'mcp:client_error' as const;
export const EVENT_INCOMING_CLIENT_CONNECTED = 'mcp:incoming_client_connected' as const;
export const EVENT_INCOMING_CLIENT_DISCONNECTED = 'mcp:incoming_client_disconnected' as const;
export const EVENT_INCOMING_CLIENTS_UPDATED = 'mcp:incoming_clients_updated' as const;

export type EventName =
  | typeof EVENT_SERVERS_UPDATED
  | typeof EVENT_SETTINGS_UPDATED
  | typeof EVENT_CLIENT_STATUS_CHANGED
  | typeof EVENT_CLIENT_ERROR
  | typeof EVENT_INCOMING_CLIENT_CONNECTED
  | typeof EVENT_INCOMING_CLIENT_DISCONNECTED
  | typeof EVENT_INCOMING_CLIENTS_UPDATED;

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
