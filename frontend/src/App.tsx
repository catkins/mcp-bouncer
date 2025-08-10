import { useState, useEffect } from 'react'
import { MCPServerConfig } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models"
import { 
  Header,
  ListenAddress, 
  ServerList, 
  ServerForm 
} from './components'
import { useMCPService } from './hooks/useMCPService'
import { useTheme } from './hooks/useTheme'

function App() {
  const {
    servers,
    settings,
    mcpUrl,
    isActive,
    addServer,
    updateServer,
    removeServer
  } = useMCPService()

  const { theme, toggleTheme } = useTheme()

  const [showAddServer, setShowAddServer] = useState<boolean>(false)
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null)

  // Debug modal state changes
  useEffect(() => {
    console.log('Modal state changed:', { showAddServer, editingServer: !!editingServer })
  }, [showAddServer, editingServer])

  const handleSaveServer = async (serverConfig: MCPServerConfig) => {
    try {
      console.log('Saving server config:', serverConfig)
      if (editingServer && editingServer.name) {
        console.log('Updating existing server:', editingServer.name)
        await updateServer(editingServer.name, serverConfig)
      } else {
        console.log('Adding new server')
        await addServer(serverConfig)
      }
      console.log('Server saved, loading updated list...')
      console.log('Closing modal...')
      setShowAddServer(false)
      setEditingServer(null)
      console.log('Modal state reset')
    } catch (error) {
      console.error('Failed to save server configuration:', error)
      // Keep the modal open if there's an error
    }
  }

  const handleCancelServer = () => {
    setShowAddServer(false)
    setEditingServer(null)
  }

  const handleEditServer = (server: MCPServerConfig) => {
    setEditingServer(server)
  }

  const handleRemoveServer = async (serverName: string) => {
    await removeServer(serverName)
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950">
      <Header isActive={isActive} theme={theme} onToggleTheme={toggleTheme} />
      
      <main className="pt-16 px-6 pb-6 max-w-5xl mx-auto">
        <ListenAddress mcpUrl={mcpUrl} settings={settings} />

        <ServerList
          servers={servers}
          onAddServer={() => setShowAddServer(true)}
          onEditServer={handleEditServer}
          onRemoveServer={handleRemoveServer}
        />

        {/* Add/Edit Server Modal */}
        {(showAddServer || editingServer) && (
          <ServerForm
            server={editingServer}
            onSave={handleSaveServer}
            onCancel={handleCancelServer}
          />
        )}
      </main>
    </div>
  )
}

export default App
