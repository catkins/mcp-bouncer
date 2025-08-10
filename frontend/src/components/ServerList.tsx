import { useState, useEffect } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { ServerCard } from './ServerCard'
import { ServerForm } from './ServerForm'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { ClientStatus } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp/models'
import { LoadingButton } from './LoadingButton'

interface ServerListProps {
  servers: MCPServerConfig[]
  clientStatus: { [key: string]: ClientStatus }
  onAddServer: (server: MCPServerConfig) => Promise<void>
  onUpdateServer: (name: string, server: MCPServerConfig) => Promise<void>
  onRemoveServer: (name: string) => Promise<void>
  onRefreshStatus?: (serverName: string) => Promise<void>
  loadingStates: {
    addServer: boolean
    updateServer: boolean
    removeServer: boolean
    general: boolean
  }
  errors: {
    addServer?: string
    updateServer?: string
    removeServer?: string
    general?: string
  }
}

export function ServerList({ 
  servers, 
  clientStatus,
  onAddServer, 
  onUpdateServer, 
  onRemoveServer,
  onRefreshStatus,
  loadingStates,
  errors
}: ServerListProps) {
  const [showAddServer, setShowAddServer] = useState<boolean>(false)
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null)

  // Debug logging
  useEffect(() => {
    console.log('ServerList state:', { showAddServer, editingServer: !!editingServer })
  }, [showAddServer, editingServer])

  const handleSaveServer = async (serverConfig: MCPServerConfig) => {
    try {
      if (editingServer && editingServer.name) {
        await onUpdateServer(editingServer.name, serverConfig)
      } else {
        await onAddServer(serverConfig)
      }
      setShowAddServer(false)
      setEditingServer(null)
    } catch (error) {
      console.error('Failed to save server:', error)
      // Keep modal open on error
    }
  }

  const handleCancelServer = () => {
    console.log('Canceling server form')
    setShowAddServer(false)
    setEditingServer(null)
  }

  const handleEditServer = (server: MCPServerConfig) => {
    console.log('Editing server:', server.name)
    setEditingServer(server)
  }

  const handleRemoveServer = async (serverName: string) => {
    try {
      await onRemoveServer(serverName)
    } catch (error) {
      console.error('Failed to remove server:', error)
    }
  }

  const handleAddServer = () => {
    console.log('Opening add server form')
    setShowAddServer(true)
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          MCP Servers
        </h2>
        <LoadingButton
          onClick={handleAddServer}
          loading={loadingStates.addServer}
          size="sm"
          className="px-3 py-2"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Server
        </LoadingButton>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
            <PlusIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
            No servers configured
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Add your first MCP server to get started
          </p>
          <LoadingButton
            onClick={handleAddServer}
            loading={loadingStates.addServer}
            size="sm"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add Server
          </LoadingButton>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => (
            <ServerCard
              key={server.name}
              server={server}
              clientStatus={clientStatus[server.name] || {}}
              onEdit={handleEditServer}
              onRemove={handleRemoveServer}
              loading={loadingStates.removeServer}
              onRefreshStatus={onRefreshStatus}
            />
          ))}
        </div>
      )}

      {(showAddServer || editingServer) && (
        <ServerForm
          server={editingServer}
          onSave={handleSaveServer}
          onCancel={handleCancelServer}
          loading={loadingStates.addServer || loadingStates.updateServer}
        />
      )}
    </div>
  )
}
