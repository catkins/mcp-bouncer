import { ServerList, Header, ClientList, TabSwitcher } from './components';
import { useServersState } from './hooks/mcp/useServersState';
import { useClientStatusState } from './hooks/mcp/useClientStatusState';
import { useServiceInfo } from './hooks/mcp/useServiceInfo';
import { useSettingsState } from './hooks/mcp/useSettingsState';
// Prefer the richer actions hook that supports loading/error state wiring
import { useMCPActions } from './hooks/mcp/useMCPActions';
import type { LoadingStates, ErrorStates } from './hooks/mcp/types';
import { useMCPSubscriptions } from './hooks/mcp/useMCPSubscriptions';
import { useTheme } from './hooks/useTheme';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { useToast } from './contexts/ToastContext';
import { useState, useEffect } from 'react';
import { useIncomingClients } from './hooks/useIncomingClients';
import { on, safeUnlisten, EVENT_LOGS_RPC_EVENT } from './tauri/events';
import LogsPage from './pages/LogsPage';
import { MCPService } from './tauri/bridge';

function AppContent() {
  const { servers, setServers, loadServers } = useServersState();
  const { clientStatus, loadClientStatus } = useClientStatusState();
  const { mcpUrl, isActive, loadMcpUrl, loadActive } = useServiceInfo();
  const { loadSettings, openConfigDirectory } = useSettingsState();

  const [, setLoadingStates] = useState<LoadingStates>({
    addServer: false,
    updateServer: false,
    removeServer: false,
    general: false,
    restartServer: {},
    toggleServer: {},
  });
  const [, setErrors] = useState<ErrorStates>({});
  const { addServer, updateServer, removeServer, toggleServer, restartServer, authorizeServer } = useMCPActions({
    servers,
    setServers: updater => setServers(prev => updater(prev)),
    setLoadingStates,
    setErrors,
    loadServers,
    loadClientStatus,
  });

  useMCPSubscriptions({
    loadServers,
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus,
  });

  // Initial bootstrap: fire in parallel so UI renders immediately
  useEffect(() => {
    Promise.allSettled([
      loadSettings(),
      loadMcpUrl(),
      loadServers(),
      loadActive(),
      loadClientStatus(),
    ]);
  }, []);
  const { clients } = useIncomingClients();

  const { theme, toggleTheme } = useTheme();
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<'servers' | 'clients' | 'logs'>('servers');
  const [logsCount, setLogsCount] = useState<number>(0);

  // Load logs count only when Logs tab is viewed the first time
  const [loadedLogsCount, setLoadedLogsCount] = useState(false);
  useEffect(() => {
    if (tab === 'logs' && !loadedLogsCount) {
      MCPService.LogsCount()
        .then(n => setLogsCount(Number(n) || 0))
        .catch(() => setLogsCount(0))
        .finally(() => setLoadedLogsCount(true));
    }
  }, [tab, loadedLogsCount]);

  // Increment badge on live log events (total DB count approximation)
  useEffect(() => {
    let cancelled = false;
    const unsubP = on(EVENT_LOGS_RPC_EVENT, () => setLogsCount(c => c + 1));
    return () => {
      cancelled = true;
      unsubP.then(u => (cancelled ? undefined : safeUnlisten(u))).catch(() => {});
    };
  }, []);

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
          logsCount={logsCount}
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
          />
        ) : tab === 'clients' ? (
          <ClientList />
        ) : (
          <LogsPage />
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
