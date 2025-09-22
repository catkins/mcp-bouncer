// Tauri v2 bridge: thin wrappers over invoke for ergonomics.
import { invoke } from '@tauri-apps/api/core';
import type { LogsHistogram } from '../types/logs';
// Local type declarations (frontend-only). In dev Tauri builds, these align with specta-generated types.
export type TransportType = 'stdio' | 'sse' | 'streamable_http';
export type MCPServerConfig = {
  name: string;
  description: string;
  transport?: TransportType;
  command: string;
  args?: string[];
  env?: Partial<Record<string, string>>;
  endpoint?: string;
  headers?: Partial<Record<string, string>>;
  requires_auth?: boolean;
  enabled: boolean;
};
export type Settings = { mcp_servers: MCPServerConfig[]; listen_addr: string };
export type ClientConnectionState = 'disconnected' | 'connecting' | 'errored' | 'connected' | 'requires_authorization' | 'authorizing';
export type ClientStatus = { name: string; state: ClientConnectionState; tools: number; last_error?: string | null; authorization_required: boolean; oauth_authenticated: boolean };
export type IncomingClient = { id: string; name: string; version: string; title?: string | null; connected_at?: string | null };
export type Tool = { name: string; description?: string | null; input_schema?: unknown | null };

export const TransportType = {
  Stdio: 'stdio',
  Sse: 'sse',
  StreamableHttp: 'streamable_http',
} as const;
export type TransportTypeConst = typeof TransportType[keyof typeof TransportType];

// Re-export generated types for consumers of this module
// Types already exported above

export const MCPService = {
  async List(): Promise<MCPServerConfig[]> {
    return await invoke('mcp_list');
  },
  async ListenAddr(): Promise<string> {
    return await invoke('mcp_listen_addr');
  },
  async IsActive(): Promise<boolean> {
    return await invoke('mcp_is_active');
  },
  async GetClientStatus(): Promise<Record<string, ClientStatus>> {
    return await invoke('mcp_get_client_status');
  },
  async GetIncomingClients(): Promise<IncomingClient[]> {
    return await invoke('mcp_get_incoming_clients');
  },
  async AddMCPServer(config: MCPServerConfig): Promise<void> {
    await invoke('mcp_add_server', { config });
  },
  async UpdateMCPServer(name: string, config: MCPServerConfig): Promise<void> {
    await invoke('mcp_update_server', { name, config });
  },
  async RemoveMCPServer(name: string): Promise<void> {
    await invoke('mcp_remove_server', { name });
  },
  async RestartClient(name: string): Promise<void> {
    await invoke('mcp_restart_client', { name });
  },
  async StartOAuth(name: string): Promise<void> {
    await invoke('mcp_start_oauth', { name });
  },
  async GetClientTools(clientName: string): Promise<Tool[]> {
    return await invoke('mcp_get_client_tools', { clientName });
  },
  async RefreshClientTools(clientName: string): Promise<void> {
    await invoke('mcp_refresh_client_tools', { clientName });
  },
  async ToggleTool(clientName: string, toolName: string, enabled: boolean): Promise<void> {
    await invoke('mcp_toggle_tool', { clientName, toolName, enabled });
  },
  // Logs
  async LogsList(params: {
    server?: string;
    method?: string;
    ok?: boolean;
    limit?: number;
    after?: { ts_ms: number; id: string };
    start_ts_ms?: number;
    end_ts_ms?: number;
  }): Promise<any[]> {
    // Use invoke directly to avoid relying on generated bindings during early development
    const payload: Record<string, unknown> = {};
    if (params.server !== undefined) payload.server = params.server;
    if (params.method !== undefined) payload.method = params.method;
    if (params.ok !== undefined) payload.ok = params.ok;
    if (params.limit !== undefined) payload.limit = params.limit;
    if (params.after !== undefined) payload.after = params.after;
    if (params.start_ts_ms !== undefined) payload.start_ts_ms = params.start_ts_ms;
    if (params.end_ts_ms !== undefined) payload.end_ts_ms = params.end_ts_ms;
    return await invoke('mcp_logs_list', { params: payload });
  },
  async LogsListSince(params: {
    since_ts_ms: number;
    server?: string;
    method?: string;
    ok?: boolean;
    limit?: number;
  }): Promise<any[]> {
    return await invoke('mcp_logs_list_since', { params });
  },
  async LogsCount(server?: string): Promise<number> {
    return await invoke('mcp_logs_count', { server });
  },
  async LogsHistogram(params: {
    server?: string;
    method?: string;
    ok?: boolean;
    maxBuckets?: number;
  } = {}): Promise<LogsHistogram> {
    const { maxBuckets, ...rest } = params ?? {};
    const sanitized: Record<string, unknown> = {};
    if (rest.server !== undefined) sanitized.server = rest.server;
    if (rest.method !== undefined) sanitized.method = rest.method;
    if (rest.ok !== undefined) sanitized.ok = rest.ok;
    if (maxBuckets != null) sanitized.max_buckets = maxBuckets;
    return await invoke('mcp_logs_histogram', { params: sanitized });
  },
};

export const SettingsService = {
  async GetSettings(): Promise<Settings | null> {
    return await invoke('settings_get_settings');
  },
  async OpenConfigDirectory(): Promise<void> {
    await invoke('settings_open_config_directory');
  },
};
