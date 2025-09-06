import { useCallback } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';

export function useServerActions(deps: {
  servers: MCPServerConfig[];
  setServers: (updater: (prev: MCPServerConfig[]) => MCPServerConfig[]) => void;
  loadServers: () => Promise<void>;
  loadClientStatus: () => Promise<void>;
}) {

  const addServer = useCallback(
    async (serverConfig: MCPServerConfig) => {
      try {
        await MCPService.AddMCPServer(serverConfig);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to add server:', error);
        throw error;
      }
    },
    [deps],
  );

  const updateServer = useCallback(
    async (serverName: string, serverConfig: MCPServerConfig) => {
      try {
        await MCPService.UpdateMCPServer(serverName, serverConfig);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to update server:', error);
        throw error;
      }
    },
    [deps],
  );

  const removeServer = useCallback(
    async (serverName: string) => {
      try {
        await MCPService.RemoveMCPServer(serverName);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to remove server:', error);
        throw error;
      }
    },
    [deps],
  );

  const toggleServer = useCallback(
    async (serverName: string, enabled: boolean) => {
      deps.setServers(prevServers =>
        prevServers.map(s => (s.name === serverName ? { ...s, enabled } : s)),
      );
      try {
        const server = deps.servers.find(s => s.name === serverName);
        if (server) {
          const updated = { ...server, enabled };
          await MCPService.UpdateMCPServer(serverName, updated);
          await deps.loadClientStatus();
        }
      } catch (error) {
        console.error('Failed to toggle server:', error);
        deps.setServers(prevServers =>
          prevServers.map(s => (s.name === serverName ? { ...s, enabled: !enabled } : s)),
        );
        throw error;
      }
    },
    [deps],
  );

  const restartServer = useCallback(
    async (serverName: string) => {
      try {
        await MCPService.RestartClient(serverName);
        await deps.loadClientStatus();
      } catch (error) {
        console.error('Failed to restart server:', error);
        throw error;
      }
    },
    [deps],
  );

  const authorizeServer = useCallback(
    async (serverName: string) => {
      try {
        await MCPService.StartOAuth(serverName);
        await deps.loadClientStatus();
      } catch (error) {
        console.error('Failed to authorize server:', error);
        throw error;
      }
    },
    [deps],
  );

  return {
    addServer,
    updateServer,
    removeServer,
    toggleServer,
    restartServer,
    authorizeServer,
  } as const;
}
