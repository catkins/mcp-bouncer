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
import { useState, useEffect, Suspense, useRef } from 'react';
import { useIncomingClients } from './hooks/useIncomingClients';
import { on, safeUnlisten, EVENT_LOGS_RPC_EVENT } from './tauri/events';
import LogsPage from './pages/LogsPage';
import { MCPService } from './tauri/bridge';
import { wrapPromise } from './utils/suspense';

function AppContent() {
  const { servers, setServers, loadServers, loading: loadingServers, loaded: serversLoaded } = useServersState();
  const { clientStatus, loadClientStatus, loading: loadingStatus, loaded: statusLoaded } = useClientStatusState();
  const { mcpUrl, isActive, loadMcpUrl, loadActive, loadingUrl, loadingActive } = useServiceInfo();
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

  // Initial bootstrap for global settings + URL/active; servers/status are loaded via Suspense resource
  useEffect(() => {
    Promise.allSettled([loadSettings(), loadMcpUrl(), loadActive()]);
  }, []);
  const { clients } = useIncomingClients();

  const { theme, toggleTheme } = useTheme();
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<'servers' | 'clients' | 'logs'>('servers');
  const [logsCount, setLogsCount] = useState<number>(0);
  const serversBootstrap = useBootstrapResource(loadServers, loadClientStatus);

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
          <Suspense fallback={
            <ServerList
              servers={[]}
              clientStatus={{}}
              isLoading={true}
              onAddServer={addServer}
              onUpdateServer={updateServer}
              onRemoveServer={removeServer}
              onToggleServer={toggleServer}
              onRestartServer={restartServer}
              onAuthorizeServer={authorizeServer}
            />
          }>
            <ServersSection
              servers={servers}
              clientStatus={clientStatus}
              loadServers={loadServers}
              loadClientStatus={loadClientStatus}
              addServer={addServer}
              updateServer={updateServer}
              removeServer={removeServer}
              toggleServer={toggleServer}
              restartServer={restartServer}
              authorizeServer={authorizeServer}
              onRefreshStatus={handleRefreshStatus}
              loadingFlags={{ loadingServers, loadingStatus, loadingUrl, loadingActive, isActive, serversLoaded, statusLoaded }}
              bootstrapResource={serversBootstrap}
            />
          </Suspense>
        ) : tab === 'clients' ? (
          <ClientList />
        ) : (
          <LogsPage />
        )}
      </main>
    </div>
  );
}

function useBootstrapResource(loadServers: () => Promise<void>, loadClientStatus: () => Promise<void>) {
  const ref = useRef<ReturnType<typeof wrapPromise> | null>(null);
  if (!ref.current) {
    ref.current = wrapPromise(Promise.allSettled([loadServers(), loadClientStatus()]));
  }
  return ref.current;
}

function ServersSection(props: {
  servers: ReturnType<typeof useServersState>['servers'];
  clientStatus: ReturnType<typeof useClientStatusState>['clientStatus'];
  loadServers: () => Promise<void>;
  loadClientStatus: () => Promise<void>;
  addServer: Parameters<typeof ServerList>[0]['onAddServer'];
  updateServer: Parameters<typeof ServerList>[0]['onUpdateServer'];
  removeServer: Parameters<typeof ServerList>[0]['onRemoveServer'];
  toggleServer: Parameters<typeof ServerList>[0]['onToggleServer'];
  restartServer: Parameters<typeof ServerList>[0]['onRestartServer'];
  authorizeServer: NonNullable<Parameters<typeof ServerList>[0]['onAuthorizeServer']>;
  onRefreshStatus: NonNullable<Parameters<typeof ServerList>[0]['onRefreshStatus']>;
  loadingFlags: { loadingServers: boolean; loadingStatus: boolean; loadingUrl: boolean; loadingActive: boolean; isActive: boolean | null; serversLoaded: boolean; statusLoaded: boolean };
  bootstrapResource: ReturnType<typeof wrapPromise>;
}) {
  const { servers, clientStatus, addServer, updateServer, removeServer, toggleServer, restartServer, authorizeServer, onRefreshStatus, loadingFlags, bootstrapResource } = props as any;
  bootstrapResource.read();
  return (
    <ServerList
      servers={servers}
      clientStatus={clientStatus}
      isLoading={!loadingFlags.serversLoaded || !loadingFlags.statusLoaded}
      onAddServer={addServer}
      onUpdateServer={updateServer}
      onRemoveServer={removeServer}
      onToggleServer={toggleServer}
      onRestartServer={restartServer}
      onAuthorizeServer={authorizeServer}
      onRefreshStatus={onRefreshStatus}
    />
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
