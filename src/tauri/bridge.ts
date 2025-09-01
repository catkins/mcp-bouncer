// Tauri v2 bridge: exports MCPService, SettingsService, and shared types.

import { invoke } from '@tauri-apps/api/core';

// Shared types for frontend-backend communication
export enum TransportType {
  TransportStdio = 'stdio',
  TransportSSE = 'sse',
  TransportStreamableHTTP = 'streamable_http',
}

export interface MCPServerConfig {
  name: string;
  description: string;
  transport: TransportType | '';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  endpoint?: string;
  headers?: Record<string, string>;
  requires_auth?: boolean;
  enabled: boolean;
}

export interface Settings {
  mcp_servers: MCPServerConfig[];
  listen_addr: string;
  auto_start: boolean;
}

export interface ClientStatus {
  name: string;
  connected: boolean;
  tools: number;
  last_error?: string;
  authorization_required: boolean;
  oauth_authenticated: boolean;
}

export type IncomingClient = {
  id: string;
  name: string;
  version: string;
  title?: string;
  connected_at: string | Date | null;
};

export const MCPService = {
  async List(): Promise<MCPServerConfig[]> {
    return invoke('mcp_list');
  },
  async ListenAddr(): Promise<string> {
    return invoke('mcp_listen_addr');
  },
  async IsActive(): Promise<boolean> {
    return invoke('mcp_is_active');
  },
  async GetClientStatus(): Promise<Record<string, ClientStatus>> {
    return invoke('mcp_get_client_status');
  },
  async GetIncomingClients(): Promise<IncomingClient[]> {
    return invoke('mcp_get_incoming_clients');
  },
  async AddMCPServer(config: MCPServerConfig): Promise<void> {
    return invoke('mcp_add_server', { config });
  },
  async UpdateMCPServer(name: string, config: MCPServerConfig): Promise<void> {
    return invoke('mcp_update_server', { name, config });
  },
  async RemoveMCPServer(name: string): Promise<void> {
    return invoke('mcp_remove_server', { name });
  },
  async ToggleServerEnabled(name: string, enabled: boolean): Promise<void> {
    return invoke('mcp_toggle_server_enabled', { name, enabled });
  },
  async RestartClient(name: string): Promise<void> {
    return invoke('mcp_restart_client', { name });
  },
  async AuthorizeClient(name: string, token?: string): Promise<void> {
    return invoke('mcp_authorize_client', { name, token: token ?? '' });
  },
  async GetClientTools(clientName: string): Promise<any[]> {
    return invoke('mcp_get_client_tools', { clientName });
  },
  async ToggleTool(clientName: string, toolName: string, enabled: boolean): Promise<void> {
    return invoke('mcp_toggle_tool', { clientName, toolName, enabled });
  },
};

export const SettingsService = {
  async GetSettings(): Promise<Settings | null> {
    return invoke('settings_get_settings');
  },
  async OpenConfigDirectory(): Promise<void> {
    return invoke('settings_open_config_directory');
  },
  async UpdateSettings(settings: Settings | null): Promise<void> {
    return invoke('settings_update_settings', { settings });
  },
};
