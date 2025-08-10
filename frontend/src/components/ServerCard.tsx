import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'

interface ServerCardProps {
  server: MCPServerConfig
  index: number
  onEdit: (server: MCPServerConfig) => void
  onRemove: (serverName: string) => Promise<void>
}

export function ServerCard({ server, index, onEdit, onRemove }: ServerCardProps) {
  return (
    <div
      className={`group relative bg-white dark:bg-gray-800 border rounded-lg p-4 transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 ${
        server.enabled 
          ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20' 
          : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{server.name}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              server.enabled 
                ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {server.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {server.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">{server.description}</p>
          )}
          <div className="space-y-0.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">Command:</span>
              <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200 font-mono text-xs">
                {server.command}
              </code>
            </div>
            {server.args && server.args.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">Args:</span>
                <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-800 dark:text-gray-200 font-mono text-xs">
                  {server.args.join(' ')}
                </code>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => onEdit(server)}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200"
            title="Edit server"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              if (server.name) {
                await onRemove(server.name)
              }
            }}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200"
            title="Remove server"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
