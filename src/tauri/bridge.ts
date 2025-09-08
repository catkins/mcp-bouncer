// Tauri v2 bridge: thin wrappers over generated bindings for ergonomics.
import { commands, type Result, type MCPServerConfig, type Settings, type ClientStatus, type IncomingClient, type ToolInfo as Tool } from './bindings';
// Keep a runtime constant for convenience while using the generated TransportType type.
import type { TransportType as TransportTypeType } from './bindings';

export const TransportType = {
  Stdio: 'stdio',
  Sse: 'sse',
  StreamableHttp: 'streamable_http',
} as const;
export type TransportType = TransportTypeType;

// Re-export generated types for consumers of this module
export type { MCPServerConfig, Settings, ClientStatus, IncomingClient, Tool };

function unwrap<T, E>(res: Result<T, E>): T {
  if (res.status === 'ok') return res.data;
  const err = res.error;
  throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
}

export const MCPService = {
  async List(): Promise<MCPServerConfig[]> {
    return unwrap(await commands.mcpList());
  },
  async ListenAddr(): Promise<string> {
    return unwrap(await commands.mcpListenAddr());
  },
  async IsActive(): Promise<boolean> {
    return unwrap(await commands.mcpIsActive());
  },
  async GetClientStatus(): Promise<Record<string, ClientStatus>> {
    // commands return Partial<Record<string, ClientStatus>>; coerce to regular record
    return unwrap(await commands.mcpGetClientStatus()) as Record<string, ClientStatus>;
  },
  async GetIncomingClients(): Promise<IncomingClient[]> {
    return unwrap(await commands.mcpGetIncomingClients());
  },
  async AddMCPServer(config: MCPServerConfig): Promise<void> {
    unwrap(await commands.mcpAddServer(config));
  },
  async UpdateMCPServer(name: string, config: MCPServerConfig): Promise<void> {
    unwrap(await commands.mcpUpdateServer(name, config));
  },
  async RemoveMCPServer(name: string): Promise<void> {
    unwrap(await commands.mcpRemoveServer(name));
  },
  async RestartClient(name: string): Promise<void> {
    unwrap(await commands.mcpRestartClient(name));
  },
  async StartOAuth(name: string): Promise<void> {
    unwrap(await commands.mcpStartOauth(name));
  },
  async GetClientTools(clientName: string): Promise<Tool[]> {
    return unwrap(await commands.mcpGetClientTools(clientName));
  },
  async RefreshClientTools(clientName: string): Promise<void> {
    unwrap(await commands.mcpRefreshClientTools(clientName));
  },
  async ToggleTool(clientName: string, toolName: string, enabled: boolean): Promise<void> {
    unwrap(await commands.mcpToggleTool(clientName, toolName, enabled));
  },
};

export const SettingsService = {
  async GetSettings(): Promise<Settings | null> {
    return unwrap(await commands.settingsGetSettings());
  },
  async OpenConfigDirectory(): Promise<void> {
    unwrap(await commands.settingsOpenConfigDirectory());
  },
};
