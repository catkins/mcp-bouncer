// Tauri v2 bridge: exports MCPService, SettingsService, and shared types.

import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import {
  MCPServerConfigSchema,
  SettingsSchema,
  ClientStatusSchema,
  IncomingClientSchema,
  ToolSchema,
} from '../types/schemas';

// Shared types for frontend-backend communication
export const TransportType = {
  Stdio: 'stdio',
  Sse: 'sse',
  StreamableHttp: 'streamable_http',
} as const;
export type TransportType = typeof TransportType[keyof typeof TransportType];

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export type Settings = z.infer<typeof SettingsSchema>;

export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export type IncomingClient = z.infer<typeof IncomingClientSchema>;
export type Tool = z.infer<typeof ToolSchema>;

export const MCPService = {
  async List(): Promise<MCPServerConfig[]> {
    const raw = await invoke('mcp_list');
    return z.array(MCPServerConfigSchema).parse(raw);
  },
  async ListenAddr(): Promise<string> {
    const raw = await invoke('mcp_listen_addr');
    return z.string().parse(raw);
  },
  async IsActive(): Promise<boolean> {
    const raw = await invoke('mcp_is_active');
    return z.boolean().parse(raw);
  },
  async GetClientStatus(): Promise<Record<string, ClientStatus>> {
    const raw = await invoke('mcp_get_client_status');
    return z.record(ClientStatusSchema).parse(raw);
  },
  async GetIncomingClients(): Promise<IncomingClient[]> {
    const raw = await invoke('mcp_get_incoming_clients');
    return z.array(IncomingClientSchema).parse(raw);
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
  async StartOAuth(name: string): Promise<void> {
    return invoke('mcp_start_oauth', { name });
  },
  async GetClientTools(clientName: string): Promise<Tool[]> {
    const raw = await invoke('mcp_get_client_tools', { clientName });
    // Accept both exact shape and lenient entries but require a string `name` at minimum
    return z.array(ToolSchema).parse(raw);
  },
  async ToggleTool(clientName: string, toolName: string, enabled: boolean): Promise<void> {
    return invoke('mcp_toggle_tool', { clientName, toolName, enabled });
  },
};

export const SettingsService = {
  async GetSettings(): Promise<Settings | null> {
    const raw = await invoke('settings_get_settings');
    if (raw == null) return null;
    return SettingsSchema.parse(raw);
  },
  async OpenConfigDirectory(): Promise<void> {
    return invoke('settings_open_config_directory');
  },
  async UpdateSettings(settings: Settings | null): Promise<void> {
    return invoke('settings_update_settings', { settings });
  },
};
