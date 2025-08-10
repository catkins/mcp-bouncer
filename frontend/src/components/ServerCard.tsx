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
      className={`border rounded-md p-4 ${
        server.enabled 
          ? 'bg-green-50 border-green-200' 
          : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900">{server.name}</h3>
            <span className={`px-2 py-1 text-xs rounded-full ${
              server.enabled 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {server.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {server.description && (
            <p className="text-sm text-gray-600 mb-2">{server.description}</p>
          )}
          <div className="text-sm text-gray-700">
            <div><strong>Command:</strong> {server.command}</div>
            {server.args && server.args.length > 0 && (
              <div><strong>Args:</strong> {server.args.join(' ')}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => onEdit(server)}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
            title="Edit server"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={async () => {
              if (server.name) {
                await onRemove(server.name)
              }
            }}
            className="p-1 text-red-500 hover:text-red-700 transition-colors"
            title="Remove server"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
