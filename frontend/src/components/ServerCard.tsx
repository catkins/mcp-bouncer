import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { LoadingButton } from './LoadingButton'

interface ServerCardProps {
  server: MCPServerConfig
  onEdit: (server: MCPServerConfig) => void
  onRemove: (serverName: string) => Promise<void>
  loading?: boolean
}

export function ServerCard({ server, onEdit, onRemove, loading = false }: ServerCardProps) {
  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {server.name}
          </h3>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            server.enabled 
              ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400' 
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}>
            {server.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LoadingButton
            onClick={() => onEdit(server)}
            disabled={loading}
            variant="secondary"
            size="sm"
            className="p-1.5"
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </LoadingButton>
          <LoadingButton
            onClick={() => onRemove(server.name)}
            loading={loading}
            variant="danger"
            size="sm"
            className="p-1.5"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </LoadingButton>
        </div>
      </div>
      
      {server.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {server.description}
        </p>
      )}
      
      <div className="space-y-1.5">
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Command:</span>
          <code className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
            {server.command}
          </code>
        </div>
        
        {server.args && server.args.length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Arguments:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {server.args.map((arg, index) => (
                <code key={index} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                  {arg}
                </code>
              ))}
            </div>
          </div>
        )}
        
        {server.env && Object.keys(server.env).length > 0 && (
          <div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Environment:</span>
            <div className="mt-1 space-y-1">
              {Object.entries(server.env).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                    {key}={value}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
