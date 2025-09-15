import { Header, ClientList, TabSwitcher } from './components';
import { useServersState } from './hooks/mcp/useServersState';
import { useServiceInfo } from './hooks/mcp/useServiceInfo';
import { useSettingsState } from './hooks/mcp/useSettingsState';
// Prefer the richer actions hook that supports loading/error state wiring
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
import ServersPage from './pages/ServersPage';

function AppContent() {
  const { servers, loadServers } = useServersState();
  const { mcpUrl, isActive, loadMcpUrl, loadActive } = useServiceInfo();
  const { loadSettings, openConfigDirectory } = useSettingsState();

  // Keep service info in sync on settings updates
  useMCPSubscriptions({
    loadServers: async () => { },
    loadActive,
    loadSettings,
    loadMcpUrl,
    loadClientStatus: async () => { },
  });

  // Initial bootstrap for global settings + URL/active; servers/status are loaded via Suspense resource
  useEffect(() => {
    Promise.allSettled([loadSettings(), loadMcpUrl(), loadActive()]);
  }, []);
  const { clients } = useIncomingClients();

  const { theme, toggleTheme } = useTheme();
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<'servers' | 'clients' | 'logs'>('servers');
  const [logsCount, setLogsCount] = useState<number>(0);

  // Load logs count on startup (keeps parity with earlier behavior)
  useEffect(() => {
    MCPService.LogsCount()
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

  useEffect(() => { loadServers(); }, []);

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
          <ServersPage />
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
