import { useCallback } from 'react';
import { MCPService, SettingsService } from '../../tauri/bridge';
import type { MCPServerConfig } from '../../tauri/bridge';
import type { LoadingStates } from './types';

export function useMCPActions(
  deps: {
    servers: MCPServerConfig[];
    setServers: (updater: (prev: MCPServerConfig[]) => MCPServerConfig[]) => void;
    setLoadingStates: (updater: (prev: LoadingStates) => LoadingStates) => void;
    setErrors: (updater: (prev: any) => any) => void;
    loadClientStatus: () => Promise<void>;
    loadServers: () => Promise<void>;
  },
) {
  const setLoading = useCallback(
    (key: keyof LoadingStates, value: boolean) => {
      deps.setLoadingStates(prev => ({ ...prev, [key]: value }));
    },
    [deps],
  );

  const setToggleLoading = useCallback(
    (serverName: string, value: boolean) => {
      deps.setLoadingStates(prev => ({
        ...prev,
        toggleServer: { ...prev.toggleServer, [serverName]: value },
      }));
    },
    [deps],
  );

  const setRestartLoading = useCallback(
    (serverName: string, value: boolean) => {
      deps.setLoadingStates(prev => ({
        ...prev,
        restartServer: { ...prev.restartServer, [serverName]: value },
      }));
    },
    [deps],
  );

  const setError = useCallback(
    (key: 'addServer' | 'updateServer' | 'removeServer' | 'general', error?: string) => {
      deps.setErrors((prev: any) => ({ ...prev, [key]: error }));
    },
    [deps],
  );

  const setToggleError = useCallback(
    (serverName: string, error?: string) => {
      deps.setErrors((prev: any) => ({
        ...prev,
        toggleServer: { ...(prev.toggleServer || {}), [serverName]: error },
      }));
    },
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
    [deps],
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
        await MCPService.AuthorizeClient(serverName);
        await deps.loadClientStatus();
      } catch (error) {
        console.error('Failed to authorize server:', error);
        setError('general', `Failed to authorize ${serverName}`);
        throw error;
      }
    },
    [deps, setError],
  );

  const openConfigDirectory = useCallback(async () => {
    try {
      await SettingsService.OpenConfigDirectory();
    } catch (error) {
      console.error('Failed to open config directory:', error);
      setError('general', 'Failed to open config directory');
    }
  }, [setError]);

  return {
    addServer,
    updateServer,
    removeServer,
    toggleServer,
    restartServer,
    authorizeServer,
    openConfigDirectory,
  };
}

