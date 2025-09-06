import { ServerList, Header, ClientList, TabSwitcher } from './components';
import { useServersState } from './hooks/mcp/useServersState';
import { useClientStatusState } from './hooks/mcp/useClientStatusState';
import { useServiceInfo } from './hooks/mcp/useServiceInfo';
import { useSettingsState } from './hooks/mcp/useSettingsState';
import { useServerActions } from './hooks/mcp/useServerActions';
import { useMCPSubscriptions } from './hooks/mcp/useMCPSubscriptions';
import { useTheme } from './hooks/useTheme';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { useToast } from './contexts/ToastContext';
import { useState, useEffect } from 'react';
import { useIncomingClients } from './hooks/useIncomingClients';

function AppContent() {
  const { servers, setServers, loadServers } = useServersState();
  const { clientStatus, loadClientStatus } = useClientStatusState();
  const { mcpUrl, isActive, loadMcpUrl, loadActive } = useServiceInfo();
  const { loadSettings, openConfigDirectory } = useSettingsState();

  const [loadingStates, setLoadingStates] = useState({
    addServer: false,
    updateServer: false,
    removeServer: false,
    general: false,
    restartServer: {} as Record<string, boolean>,
    toggleServer: {} as Record<string, boolean>,
  });
  const [errors, setErrors] = useState<{ addServer?: string; updateServer?: string; removeServer?: string; general?: string; toggleServer?: Record<string, string | undefined> }>({});

  const { addServer, updateServer, removeServer, toggleServer, restartServer, authorizeServer } = useServerActions({
    servers,
    setServers: updater => setServers(prev => updater(prev)),
    setLoadingStates: updater => setLoadingStates(prev => updater(prev)),
    setErrors: updater => setErrors(prev => updater(prev)),
    loadServers,
    loadClientStatus,
  });

  useMCPSubscriptions({
    loadServers,
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus,
    setToggleError: (serverName: string, error?: string) =>
      setErrors(prev => ({ ...prev, toggleServer: { ...(prev.toggleServer || {}), [serverName]: error } })),
    clearToggleLoading: (serverName: string) =>
      setLoadingStates(prev => ({ ...prev, toggleServer: { ...prev.toggleServer, [serverName]: false } })),
    clearRestartLoading: (serverName: string) =>
      setLoadingStates(prev => ({ ...prev, restartServer: { ...prev.restartServer, [serverName]: false } })),
  });

  // Initial bootstrap
  useEffect(() => {
    (async () => {
      await loadSettings();
      await loadMcpUrl();
      await loadServers();
      await loadActive();
      await loadClientStatus();
    })();
  }, []);
  const { clients } = useIncomingClients();

  const { theme, toggleTheme } = useTheme();
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<'servers' | 'clients'>('servers');

  const handleRefreshStatus = async (serverName: string) => {
    await loadClientStatus();
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-radial dark:from-gray-800 dark:via-gray-800 dark:to-gray-900">
      <Header
        isActive={isActive}
        toggleTheme={toggleTheme}
        theme={theme}
        onOpenConfig={openConfigDirectory}
        mcpUrl={mcpUrl}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <main className="pt-16 px-6 pb-6 max-w-5xl mx-auto">
        <TabSwitcher
          value={tab}
          onChange={setTab}
          serverCount={servers.length}
          clientCount={clients.length}
        />

        {tab === 'servers' ? (
          <ServerList
            servers={servers}
            clientStatus={clientStatus}
            onAddServer={addServer}
            onUpdateServer={updateServer}
            onRemoveServer={removeServer}
            onToggleServer={toggleServer}
            onRestartServer={restartServer}
            onAuthorizeServer={authorizeServer}
            onRefreshStatus={handleRefreshStatus}
            loadingStates={loadingStates}
            errors={errors}
          />
        ) : (
          <ClientList />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
