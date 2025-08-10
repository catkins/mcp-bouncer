import { StatusIndicator, ListenAddress, ServerList, Header } from './components'
import { useMCPService } from './hooks/useMCPService'
import { useTheme } from './hooks/useTheme'
import { ToastProvider } from './contexts/ToastContext'
import { ToastContainer } from './components/Toast'
import { useToast } from './contexts/ToastContext'

function AppContent() {
  const { servers, mcpUrl, isActive, loadingStates, errors, addServer, updateServer, removeServer } = useMCPService()
  const { theme, toggleTheme } = useTheme()
  const { toasts, removeToast } = useToast()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header 
        isActive={isActive} 
        toggleTheme={toggleTheme}
        theme={theme}
      />
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <main className="pt-16 px-6 pb-6 max-w-5xl mx-auto">
        <ListenAddress mcpUrl={mcpUrl} />
        <ServerList 
          servers={servers}
          onAddServer={addServer}
          onUpdateServer={updateServer}
          onRemoveServer={removeServer}
          loadingStates={loadingStates}
          errors={errors}
        />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
