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
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">MCP Servers</h2>
        <button
          onClick={onAddServer}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 hover:shadow-md active:scale-95 text-sm font-medium"
        >
          <PlusIcon className="h-3.5 w-3.5" />
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
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full mb-3">
              <Cog6ToothIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">No MCP servers configured</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Get started by adding your first MCP server</p>
            <button
              onClick={onAddServer}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add Server
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
