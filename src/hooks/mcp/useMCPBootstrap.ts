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
  const loadServers = useCallback(async () => {
    try {
      setters.setLoading('general', true);
      const serverList = await MCPService.List();
      if (import.meta.env.DEV) console.log('Loaded servers:', serverList);
      setters.setServers(serverList);
    } catch (error) {
      console.error('Failed to load servers:', error);
      setters.setError('general', 'Failed to load servers');
    } finally {
      setters.setLoading('general', false);
    }
  }, [setters]);

  const loadSettings = useCallback(async () => {
    try {
      const currentSettings = await SettingsService.GetSettings();
      setters.setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setters.setError('general', 'Failed to load settings');
    }
  }, [setters]);

  const loadMcpUrl = useCallback(async () => {
    try {
      const url = await MCPService.ListenAddr();
      setters.setMcpUrl(url);
    } catch (error) {
      console.error('Failed to load MCP URL:', error);
      setters.setError('general', 'Failed to load MCP URL');
    }
  }, [setters]);

  const loadActive = useCallback(async () => {
    try {
      const active = await MCPService.IsActive();
      setters.setIsActive(active);
    } catch (error) {
      console.error('Failed to load active state:', error);
      setters.setError('general', 'Failed to load service status');
    }
  }, [setters]);

  const loadClientStatus = useCallback(async () => {
    try {
      const status = await MCPService.GetClientStatus();
      setters.setClientStatus(status);
    } catch (error) {
      console.error('Failed to load client status:', error);
      setters.setError('general', 'Failed to load client status');
    }
  }, [setters]);

  const init = useCallback(async () => {
    await loadSettings();
    await loadMcpUrl();
    await loadServers();
    await loadActive();
    await loadClientStatus();
  }, [loadSettings, loadMcpUrl, loadServers, loadActive, loadClientStatus]);

  return { loadServers, loadSettings, loadMcpUrl, loadActive, loadClientStatus, init };
}

