import { useCallback } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';

export function useServerActions(deps: {
  servers: MCPServerConfig[];
  setServers: (updater: (prev: MCPServerConfig[]) => MCPServerConfig[]) => void;
  setLoadingStates: (
    updater: (prev: {
      addServer: boolean;
      updateServer: boolean;
      removeServer: boolean;
      general: boolean;
      restartServer: Record<string, boolean>;
      toggleServer: Record<string, boolean>;
    }) => any,
  ) => void;
  setErrors: (updater: (prev: any) => any) => void;
  loadServers: () => Promise<void>;
  loadClientStatus: () => Promise<void>;
}) {
  const setLoading = useCallback(
    (k: 'addServer' | 'updateServer' | 'removeServer' | 'general', v: boolean) =>
      deps.setLoadingStates(prev => ({ ...prev, [k]: v })),
    [deps],
  );
  const setError = useCallback(
    (k: 'addServer' | 'updateServer' | 'removeServer' | 'general', e?: string) =>
      deps.setErrors((prev: any) => ({ ...prev, [k]: e })),
    [deps],
  );
  const setToggleLoading = useCallback(
    (serverName: string, v: boolean) =>
      deps.setLoadingStates(prev => ({
        ...prev,
        toggleServer: { ...prev.toggleServer, [serverName]: v },
      })),
    [deps],
  );
  const setRestartLoading = useCallback(
    (serverName: string, v: boolean) =>
      deps.setLoadingStates(prev => ({
        ...prev,
        restartServer: { ...prev.restartServer, [serverName]: v },
      })),
    [deps],
  );
  const setToggleError = useCallback(
    (serverName: string, error?: string) =>
      deps.setErrors((prev: any) => ({
        ...prev,
        toggleServer: { ...prev.toggleServer, [serverName]: error },
      })),
    [deps],
  );

  const addServer = useCallback(
    async (serverConfig: MCPServerConfig) => {
      try {
        setLoading('addServer', true);
        setError('addServer');
        await MCPService.AddMCPServer(serverConfig);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to add server:', error);
        setError('addServer', 'Failed to add server');
        throw error;
      } finally {
        setLoading('addServer', false);
      }
    },
    [deps, setLoading, setError],
  );

  const updateServer = useCallback(
    async (serverName: string, serverConfig: MCPServerConfig) => {
      try {
        setLoading('updateServer', true);
        setError('updateServer');
        await MCPService.UpdateMCPServer(serverName, serverConfig);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to update server:', error);
        setError('updateServer', 'Failed to update server');
        throw error;
      } finally {
        setLoading('updateServer', false);
      }
    },
    [deps, setLoading, setError],
  );

  const removeServer = useCallback(
    async (serverName: string) => {
      try {
        setLoading('removeServer', true);
        setError('removeServer');
        await MCPService.RemoveMCPServer(serverName);
        await deps.loadServers();
      } catch (error) {
        console.error('Failed to remove server:', error);
        setError('removeServer', 'Failed to remove server');
        throw error;
      } finally {
        setLoading('removeServer', false);
      }
    },
    [deps, setLoading, setError],
  );

  const toggleServer = useCallback(
    async (serverName: string, enabled: boolean) => {
      setToggleError(serverName);
      setToggleLoading(serverName, true);
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
        setToggleError(serverName, `Failed to ${enabled ? 'enable' : 'disable'} server`);
        throw error;
      } finally {
        setToggleLoading(serverName, false);
      }
    },
    [deps, setToggleError, setToggleLoading],
  );

  const restartServer = useCallback(
    async (serverName: string) => {
      setRestartLoading(serverName, true);
      try {
        await MCPService.RestartClient(serverName);
        await deps.loadClientStatus();
      } catch (error) {
        console.error('Failed to restart server:', error);
        setError('general', `Failed to restart ${serverName}`);
        throw error;
      } finally {
        setRestartLoading(serverName, false);
      }
    },
    [deps, setError],
  );

  const authorizeServer = useCallback(
    async (serverName: string) => {
      try {
        await MCPService.StartOAuth(serverName);
        await deps.loadClientStatus();
      } catch (error) {
        console.error('Failed to authorize server:', error);
        setError('general', `Failed to authorize ${serverName}`);
        throw error;
      }
    },
    [deps, setError],
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

