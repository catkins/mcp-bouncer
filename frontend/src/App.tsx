import { useState, useEffect } from 'react'
import { MCPServerConfig } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models"
import { 
  StatusIndicator, 
  ListenAddress, 
  ServerList, 
  ServerForm 
} from './components'
import { useMCPService } from './hooks/useMCPService'

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
    <div className="h-screen bg-white p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3 mt-2">
        🤖 MCP Bouncer
        <StatusIndicator isActive={isActive} />
      </h1>

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
    </div>
  )
}

export default App
