// Tauri v2 bridge: thin wrappers over invoke for ergonomics.
import { invoke } from '@tauri-apps/api/core';
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
  enabled: boolean;
};
export type ServerTransport = 'tcp' | 'unix' | 'stdio';
export type Settings = { mcp_servers: MCPServerConfig[]; listen_addr: string; transport: ServerTransport };
export type SettingsDetail = { settings: Settings; path: string };
export type SocketBridgeInfo = { path: string; exists: boolean };
export type ClientConnectionState = 'disconnected' | 'connecting' | 'errored' | 'connected' | 'requires_authorization' | 'authorizing';
export type ClientStatus = { name: string; state: ClientConnectionState; tools: number; last_error?: string | null; authorization_required: boolean; oauth_authenticated: boolean };
export type IncomingClient = { id: string; name: string; version: string; title?: string | null; connected_at?: string | null };
export type Tool = { name: string; description?: string | null; input_schema?: unknown | null };
export type DebugCallToolResponse = {
  duration_ms: number;
  ok: boolean;
  result: unknown;
  request_arguments?: unknown | null;
};

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
  async DebugCallTool(
    serverName: string,
    toolName: string,
    args?: Record<string, unknown> | null,
  ): Promise<DebugCallToolResponse> {
    return await invoke('mcp_debug_call_tool', {
      serverName,
      toolName,
      args: args ?? null,
    });
  },
};

export const SettingsService = {
  async GetSettings(): Promise<SettingsDetail> {
    return await invoke('settings_get_settings');
  },
  async OpenConfigDirectory(): Promise<void> {
    await invoke('settings_open_config_directory');
  },
  async UpdateSettings(settings: Settings): Promise<void> {
    await invoke('settings_update_settings', { settings });
  },
};

export const MiscService = {
  async GetSocketBridgePath(): Promise<SocketBridgeInfo | null> {
    return await invoke('mcp_socket_bridge_path');
  },
};
