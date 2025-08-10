import { PlusIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { ServerCard } from './ServerCard'

interface ServerListProps {
  servers: MCPServerConfig[]
  onAddServer: () => void
  onEditServer: (server: MCPServerConfig) => void
  onRemoveServer: (serverName: string) => Promise<void>
}

export function ServerList({ servers, onAddServer, onEditServer, onRemoveServer }: ServerListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-700">MCP Servers</h2>
        <button
          onClick={onAddServer}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Add Server
        </button>
      </div>
      <div className="space-y-3">
        {servers.length > 0 ? (
          servers.map((server, index) => (
            <ServerCard
              key={server.name || index}
              server={server}
              index={index}
              onEdit={onEditServer}
              onRemove={onRemoveServer}
            />
          ))
        ) : (
          <div className="text-gray-500 italic text-center py-8">
            <Cog6ToothIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No MCP servers configured</p>
            <p className="text-sm">Click "Add Server" to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
