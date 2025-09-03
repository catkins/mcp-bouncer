import { useState, useEffect } from 'react';
import type { MCPServerConfig, Settings, ClientStatus } from '../tauri/bridge';
import { useMCPBootstrap } from './mcp/useMCPBootstrap';
import { useMCPActions } from './mcp/useMCPActions';
import { useMCPEvents } from './mcp/useMCPEvents';

export function useMCPService() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mcpUrl, setMcpUrl] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [clientStatus, setClientStatus] = useState<{ [key: string]: ClientStatus }>({});
  const [loadingStates, setLoadingStates] = useState<{
    addServer: boolean;
    updateServer: boolean;
    removeServer: boolean;
    general: boolean;
    restartServer: { [key: string]: boolean };
    toggleServer: { [key: string]: boolean };
  }>({
    addServer: false,
    updateServer: false,
    removeServer: false,
    general: false,
    restartServer: {},
    toggleServer: {},
  });
  const [errors, setErrors] = useState<{
    addServer?: string;
    updateServer?: string;
    removeServer?: string;
    general?: string;
    toggleServer?: { [key: string]: string | undefined };
  }>({});
  // Build helpers from modular hooks
  const { loadServers, loadSettings, loadMcpUrl, loadActive, loadClientStatus, init } =
    useMCPBootstrap({
      setServers,
      setSettings,
      setMcpUrl,
      setIsActive,
      setClientStatus,
      setLoading: (k, v) => setLoadingStates(prev => ({ ...prev, [k]: v })),
      setError: (k, e) => setErrors(prev => ({ ...prev, [k]: e })),
    });

  const actions = useMCPActions({
    servers,
    setServers: updater => setServers(prev => updater(prev)),
    setLoadingStates: updater => setLoadingStates(prev => updater(prev)),
    setErrors: updater => setErrors(prev => updater(prev)),
    loadClientStatus,
    loadServers,
  });

  const setToggleError = (serverName: string, error?: string) =>
    setErrors(prev => ({
      ...prev,
      toggleServer: { ...prev.toggleServer, [serverName]: error },
    }));

  useMCPEvents({
    loadServers,
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus,
    setToggleError,
    clearToggleLoading: (serverName: string) =>
      setLoadingStates(prev => ({
        ...prev,
        toggleServer: { ...prev.toggleServer, [serverName]: false },
      })),
    clearRestartLoading: (serverName: string) =>
      setLoadingStates(prev => ({
        ...prev,
        restartServer: { ...prev.restartServer, [serverName]: false },
      })),
  });

  useEffect(() => {
    init();
  }, [init]);

  // Note: We piggyback polling into the main effect to avoid extra hooks in some storybook contexts

  return {
    servers,
    settings,
    mcpUrl,
    isActive,
    loadingStates,
    errors,
    addServer: actions.addServer,
    updateServer: actions.updateServer,
    removeServer: actions.removeServer,
    toggleServer: actions.toggleServer,
    restartServer: actions.restartServer,
    authorizeServer: actions.authorizeServer,
    openConfigDirectory: actions.openConfigDirectory,
    loadServers,
    loadSettings,
    loadMcpUrl,
    loadActive,
    loadClientStatus,
    clientStatus,
  };
}
