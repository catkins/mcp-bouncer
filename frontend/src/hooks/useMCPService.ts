import { useState, useEffect } from 'react';
import { MCPService } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp';
import { SettingsService } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/settings';
import {
  MCPServerConfig,
  Settings,
} from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/settings/models';
import { ClientStatus } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp/models';
import { Events } from '@wailsio/runtime';

const isDev = import.meta.env.DEV;

async function fetchAPI(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'API request failed');
  }
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return;
  }
  return response.json();
}

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

  const setLoading = (key: keyof typeof loadingStates, value: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: value }));
  };

  const setToggleLoading = (serverName: string, value: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      toggleServer: { ...prev.toggleServer, [serverName]: value },
    }));
  };

  const setRestartLoading = (serverName: string, value: boolean) => {
    setLoadingStates(prev => ({
      ...prev,
      restartServer: { ...prev.restartServer, [serverName]: value },
    }));
  };

  const setError = (key: keyof typeof errors, error?: string) => {
    setErrors(prev => ({ ...prev, [key]: error }));
  };

  const setToggleError = (serverName: string, error?: string) => {
    setErrors(prev => ({
      ...prev,
      toggleServer: { ...prev.toggleServer, [serverName]: error },
    }));
  };

  const loadServers = async () => {
    try {
      setLoading('general', true);
      const serverList = isDev ? await fetchAPI('/api/mcp/servers') : await MCPService.List();
      console.log('Loaded servers:', serverList);
      setServers(serverList);
    } catch (error) {
      console.error('Failed to load servers:', error);
      setError('general', 'Failed to load servers');
    } finally {
      setLoading('general', false);
    }
  };

  const loadSettings = async () => {
    try {
      const currentSettings = isDev
        ? await fetchAPI('/api/settings')
        : await SettingsService.GetSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setError('general', 'Failed to load settings');
    }
  };

  const loadMcpUrl = async () => {
    try {
      const url = isDev ? await fetchAPI('/api/mcp/listen-addr') : await MCPService.ListenAddr();
      setMcpUrl(url);
    } catch (error) {
      console.error('Failed to load MCP URL:', error);
      setError('general', 'Failed to load MCP URL');
    }
  };

  const loadActive = async () => {
    try {
      const active = isDev ? await fetchAPI('/api/mcp/is-active') : await MCPService.IsActive();
      setIsActive(active);
    } catch (error) {
      console.error('Failed to load active state:', error);
      setError('general', 'Failed to load service status');
    }
  };

  const loadClientStatus = async () => {
    try {
      const status = isDev
        ? await fetchAPI('/api/mcp/client-status')
        : await MCPService.GetClientStatus();
      setClientStatus(status);
    } catch (error) {
      console.error('Failed to load client status:', error);
      setError('general', 'Failed to load client status');
    }
  };

  const addServer = async (serverConfig: MCPServerConfig) => {
    try {
      setLoading('addServer', true);
      setError('addServer');
      if (isDev) {
        await fetchAPI('/api/mcp/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverConfig),
        });
      } else {
        await MCPService.AddMCPServer(serverConfig);
      }
      await loadServers();
    } catch (error) {
      console.error('Failed to add server:', error);
      setError('addServer', 'Failed to add server');
      throw error;
    } finally {
      setLoading('addServer', false);
    }
  };

  const updateServer = async (serverName: string, serverConfig: MCPServerConfig) => {
    try {
      setLoading('updateServer', true);
      setError('updateServer');
      if (isDev) {
        await fetchAPI(`/api/mcp/servers/${serverName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverConfig),
        });
      } else {
        await MCPService.UpdateMCPServer(serverName, serverConfig);
      }
      await loadServers();
    } catch (error) {
      console.error('Failed to update server:', error);
      setError('updateServer', 'Failed to update server');
      throw error;
    } finally {
      setLoading('updateServer', false);
    }
  };

  const removeServer = async (serverName: string) => {
    try {
      setLoading('removeServer', true);
      setError('removeServer');
      if (isDev) {
        await fetchAPI(`/api/mcp/servers/${serverName}`, { method: 'DELETE' });
      } else {
        await MCPService.RemoveMCPServer(serverName);
      }
      await loadServers();
    } catch (error) {
      console.error('Failed to remove server:', error);
      setError('removeServer', 'Failed to remove server');
      throw error;
    } finally {
      setLoading('removeServer', false);
    }
  };

  const toggleServer = async (serverName: string, enabled: boolean) => {
    setToggleError(serverName);
    setToggleLoading(serverName, true);
    setServers(prevServers =>
      prevServers.map(server => (server.name === serverName ? { ...server, enabled } : server)),
    );

    try {
      const server = servers.find(s => s.name === serverName);
      if (server) {
        const updatedServer = { ...server, enabled };
        if (isDev) {
          await fetchAPI(`/api/mcp/servers/${serverName}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedServer),
          });
        } else {
          await MCPService.UpdateMCPServer(serverName, updatedServer);
        }
        await loadClientStatus();
      }
    } catch (error) {
      console.error('Failed to toggle server:', error);
      setServers(prevServers =>
        prevServers.map(server =>
          server.name === serverName ? { ...server, enabled: !enabled } : server,
        ),
      );
      setToggleError(serverName, `Failed to ${enabled ? 'enable' : 'disable'} server`);
      throw error;
    } finally {
      setToggleLoading(serverName, false);
    }
  };

  const restartServer = async (serverName: string) => {
    setRestartLoading(serverName, true);
    try {
      if (isDev) {
        await fetchAPI(`/api/mcp/servers/${serverName}/restart`, { method: 'POST' });
      } else {
        await MCPService.RestartClient(serverName);
      }
      await loadClientStatus();
    } catch (error) {
      console.error('Failed to restart server:', error);
      setError('general', `Failed to restart ${serverName}`);
      throw error;
    } finally {
      setRestartLoading(serverName, false);
    }
  };

  const authorizeServer = async (serverName: string) => {
    try {
      if (isDev) {
        await fetchAPI(`/api/mcp/servers/${serverName}/authorize`, { method: 'POST' });
      } else {
        await MCPService.AuthorizeClient(serverName);
      }
      await loadClientStatus();
    } catch (error) {
      console.error('Failed to authorize server:', error);
      setError('general', `Failed to authorize ${serverName}`);
      throw error;
    }
  };

  const openConfigDirectory = async () => {
    try {
      if (isDev) {
        await fetchAPI('/api/settings/open-config-directory', { method: 'POST' });
      } else {
        await SettingsService.OpenConfigDirectory();
      }
    } catch (error) {
      console.error('Failed to open config directory:', error);
      setError('general', 'Failed to open config directory');
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadSettings();
      await loadMcpUrl();
      await loadServers();
      await loadActive();
      await loadClientStatus();
    };

    init();

    if (isDev) {
      const interval = setInterval(() => {
        loadServers();
        loadActive();
        loadClientStatus();
        loadSettings();
        loadMcpUrl();
      }, 2000);
      return () => clearInterval(interval);
    }

    const unsubscribe = Events.On('mcp:servers_updated', async () => {
      await loadServers();
      await loadActive();
      await loadClientStatus();
    });

    const unsubscribeSettings = Events.On('settings:updated', async () => {
      await loadSettings();
      await loadMcpUrl();
      await loadServers();
      await loadClientStatus();
    });

    const unsubscribeClientStatus = Events.On('mcp:client_status_changed', async () => {
      await loadClientStatus();
    });

    const unsubscribeClientError = Events.On('mcp:client_error', async event => {
      const data = event.data as any;
      if (data && data.server_name) {
        setToggleError(data.server_name, `${data.action} failed: ${data.error}`);
        await loadClientStatus();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSettings();
      unsubscribeClientStatus();
      unsubscribeClientError();
    };
  }, []);

  return {
    servers,
    settings,
    mcpUrl,
    isActive,
    loadingStates,
    errors,
    addServer,
    updateServer,
    removeServer,
    toggleServer,
    restartServer,
    authorizeServer,
    openConfigDirectory,
    loadServers,
    loadSettings,
    loadMcpUrl,
    loadActive,
    loadClientStatus,
    clientStatus,
  };
}
