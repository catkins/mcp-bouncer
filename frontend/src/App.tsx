import { ServerList, Header, ClientList, TabSwitcher } from './components';
import { useMCPService } from './hooks/useMCPService';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { useToast } from './contexts/ToastContext';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from './components/ThemeProvider';

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
  const { toasts, removeToast } = useToast();
  const [tab, setTab] = useState<'servers' | 'clients'>('servers');

  const handleRefreshStatus = async (serverName: string) => {
    await loadClientStatus();
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-radial dark:from-gray-800 dark:via-gray-800 dark:to-gray-900">
      <Header
        isActive={isActive}
        onOpenConfig={openConfigDirectory}
        mcpUrl={mcpUrl}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <Toaster />
      <main className="pt-16 px-6 pb-6 max-w-5xl mx-auto">
        <TabSwitcher value={tab} onChange={setTab} />

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
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
