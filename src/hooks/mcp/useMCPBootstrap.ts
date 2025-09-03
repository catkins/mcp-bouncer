import { useCallback } from 'react';
import { MCPService, SettingsService } from '../../tauri/bridge';
import type { MCPServerConfig, Settings } from '../../tauri/bridge';
import type { ClientStatusMap } from './types';

export function useMCPBootstrap(
  setters: {
    setServers: (v: MCPServerConfig[]) => void;
    setSettings: (v: Settings | null) => void;
    setMcpUrl: (v: string) => void;
    setIsActive: (v: boolean | null) => void;
    setClientStatus: (v: ClientStatusMap) => void;
    setLoading: (key: 'addServer' | 'updateServer' | 'removeServer' | 'general', value: boolean) => void;
    setError: (key: 'addServer' | 'updateServer' | 'removeServer' | 'general', error?: string) => void;
  },
) {
  const {
    setServers,
    setSettings,
    setMcpUrl,
    setIsActive,
    setClientStatus,
    setLoading,
    setError,
  } = setters;
  const loadServers = useCallback(async () => {
    try {
      setLoading('general', true);
      const serverList = await MCPService.List();
      if (import.meta.env.DEV) console.log('Loaded servers:', serverList);
      setServers(serverList);
    } catch (error) {
      console.error('Failed to load servers:', error);
      setError('general', 'Failed to load servers');
    } finally {
      setLoading('general', false);
    }
  }, [setLoading, setServers, setError]);

  const loadSettings = useCallback(async () => {
    try {
      const currentSettings = await SettingsService.GetSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setError('general', 'Failed to load settings');
    }
  }, [setSettings, setError]);

  const loadMcpUrl = useCallback(async () => {
    try {
      const url = await MCPService.ListenAddr();
      setMcpUrl(url);
    } catch (error) {
      console.error('Failed to load MCP URL:', error);
      setError('general', 'Failed to load MCP URL');
    }
  }, [setMcpUrl, setError]);

  const loadActive = useCallback(async () => {
    try {
      const active = await MCPService.IsActive();
      setIsActive(active);
    } catch (error) {
      console.error('Failed to load active state:', error);
      setError('general', 'Failed to load service status');
    }
  }, [setIsActive, setError]);

  const loadClientStatus = useCallback(async () => {
    try {
      const status = await MCPService.GetClientStatus();
      setClientStatus(status);
    } catch (error) {
      console.error('Failed to load client status:', error);
      setError('general', 'Failed to load client status');
    }
  }, [setClientStatus, setError]);

  const init = useCallback(async () => {
    await loadSettings();
    await loadMcpUrl();
    await loadServers();
    await loadActive();
    await loadClientStatus();
  }, [loadSettings, loadMcpUrl, loadServers, loadActive, loadClientStatus]);

  return { loadServers, loadSettings, loadMcpUrl, loadActive, loadClientStatus, init };
}
