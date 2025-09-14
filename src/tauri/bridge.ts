// Tauri v2 bridge: thin wrappers over invoke for ergonomics.
import { invoke } from '@tauri-apps/api/core';
import type { MCPServerConfig, Settings, ClientStatus, IncomingClient, ToolInfo as Tool, TransportType as TransportTypeType } from './bindings';

export const TransportType = {
  Stdio: 'stdio',
  Sse: 'sse',
  StreamableHttp: 'streamable_http',
} as const;
export type TransportType = TransportTypeType;

// Re-export generated types for consumers of this module
export type { MCPServerConfig, Settings, ClientStatus, IncomingClient, Tool };

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
  }): Promise<any[]> {
    // Use invoke directly to avoid relying on generated bindings during early development
    return await invoke('mcp_logs_list', { params });
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
};

export const SettingsService = {
  async GetSettings(): Promise<Settings | null> {
    return await invoke('settings_get_settings');
  },
  async OpenConfigDirectory(): Promise<void> {
    await invoke('settings_open_config_directory');
  },
};
