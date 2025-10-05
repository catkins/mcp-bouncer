import { Header, TabSwitcher, type TabKey } from './components';
import ClientList from './pages/ClientList';
import { useServersState } from './hooks/mcp/useServersState';
import { useServiceInfo } from './hooks/mcp/useServiceInfo';
import { useSettingsState } from './hooks/mcp/useSettingsState';
// Prefer the richer actions hook that supports loading/error state wiring
import { useMCPSubscriptions } from './hooks/mcp/useMCPSubscriptions';
import { useTheme } from './hooks/useTheme';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { useToast } from './contexts/ToastContext';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useIncomingClients } from './hooks/useIncomingClients';
import { on, safeUnlisten, EVENT_LOGS_RPC_EVENT } from './tauri/events';
import LogsPage from './pages/LogsPage';
import { sqlLoggingService } from './lib/sqlLogging';
import ServersPage from './pages/ServersPage';
import { useClientStatusState } from './hooks/mcp/useClientStatusState';
import DebuggerPage from './pages/DebuggerPage';

function AppContent() {
  const { servers, loadServers } = useServersState();
  const { mcpUrl, isActive, loadMcpUrl, loadActive } = useServiceInfo();
  const { loadSettings, openConfigDirectory } = useSettingsState();
  const { clientStatus, loadClientStatus, loaded: statusLoaded } = useClientStatusState();

  // Keep service info in sync on settings updates
  useMCPSubscriptions({
    loadServers: async () => { },
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus,
  });

  // Initial bootstrap for global settings + URL/active
  useEffect(() => {
    Promise.allSettled([loadSettings(), loadMcpUrl(), loadActive(), loadClientStatus()]);
  }, [loadSettings, loadMcpUrl, loadActive, loadClientStatus]);

  useEffect(() => {
    loadServers();
    loadClientStatus();
  }, [loadServers, loadClientStatus]);

  const { clients } = useIncomingClients();

  const { theme, toggleTheme } = useTheme();
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<TabKey>('servers');
  const [debugServer, setDebugServer] = useState<string | null>(null);
  const [logsCount, setLogsCount] = useState<number>(0);

  // Load logs count on startup (keeps parity with earlier behavior)
  useEffect(() => {
    sqlLoggingService
      .countEvents()
      .then(n => setLogsCount(Number(n) || 0))
      .catch(() => setLogsCount(0));
  }, []);

  // Increment badge on live log events (total DB count approximation)
  useEffect(() => {
    let cancelled = false;
    const unsubP = on(EVENT_LOGS_RPC_EVENT, () => setLogsCount(c => c + 1));
    return () => {
      cancelled = true;
      unsubP.then(u => (cancelled ? undefined : safeUnlisten(u))).catch(() => { });
    };
  }, []);

  const isDebuggerEligible = useCallback(
    (name: string) => {
      const status = clientStatus[name];
      return status?.state === 'connected' && (status.tools ?? 0) > 0;
    },
    [clientStatus],
  );

  const debuggerCandidates = useMemo(
    () => servers.filter(server => isDebuggerEligible(server.name)),
    [servers, isDebuggerEligible],
  );
  const debuggerCount = debuggerCandidates.length;
  const firstDebugger = debuggerCandidates[0]?.name ?? null;

  useEffect(() => {
    if (tab !== 'debugger') return;
    if (debuggerCount === 0) {
      if (debugServer !== null) setDebugServer(null);
      return;
    }
    if (!debugServer || !isDebuggerEligible(debugServer)) {
      if (firstDebugger && debugServer !== firstDebugger) {
        setDebugServer(firstDebugger);
      }
    }
  }, [tab, debugServer, debuggerCount, firstDebugger, isDebuggerEligible]);

  const handleOpenDebugger = useCallback((serverName: string) => {
    setDebugServer(serverName);
    setTab('debugger');
  }, []);

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
          debuggerCount={debuggerCount}
        />


        {tab === 'servers' ? (
          <ServersPage
            clientStatus={clientStatus}
            loadClientStatus={loadClientStatus}
            statusLoaded={statusLoaded}
            onOpenDebugger={handleOpenDebugger}
          />
        ) : tab === 'clients' ? (
          <ClientList />
        ) : tab === 'logs' ? (
          <LogsPage />
        ) : (
          <DebuggerPage
            servers={servers}
            clientStatus={clientStatus}
            eligibleServers={debuggerCandidates.map(server => server.name)}
            selectedServer={debugServer}
            onSelectServer={setDebugServer}
            statusLoaded={statusLoaded}
          />
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
