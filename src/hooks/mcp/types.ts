import type { MCPServerConfig, Settings, ClientStatus } from '../../tauri/bridge';

export type ClientStatusMap = { [key: string]: ClientStatus };

export interface LoadingStates {
  addServer: boolean;
  updateServer: boolean;
  removeServer: boolean;
  general: boolean;
  restartServer: { [key: string]: boolean };
  toggleServer: { [key: string]: boolean };
}

export interface ErrorStates {
  addServer?: string;
  updateServer?: string;
  removeServer?: string;
  general?: string;
  toggleServer?: { [key: string]: string | undefined };
}

export interface MCPState {
  servers: MCPServerConfig[];
  settings: Settings | null;
  mcpUrl: string;
  isActive: boolean | null;
  clientStatus: ClientStatusMap;
  loadingStates: LoadingStates;
  errors: ErrorStates;
}

