import { ServerList, Header, ClientList, TabSwitcher } from './components';
import { useMCPService } from './hooks/useMCPService';
import { useTheme } from './hooks/useTheme';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { useToast } from './contexts/ToastContext';
import { useState } from 'react';
import { useIncomingClients } from './hooks/useIncomingClients';

function AppContent() {
  const {
    servers,
    clientStatus,
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
    loadClientStatus,
    openConfigDirectory,
  } = useMCPService();
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
