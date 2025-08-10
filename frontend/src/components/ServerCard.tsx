import { PencilIcon, TrashIcon, ArrowPathIcon, WrenchScrewdriverIcon, CheckCircleIcon, XCircleIcon, NoSymbolIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { ClientStatus } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp/models'
import { LoadingButton } from './LoadingButton'

interface ServerCardProps {
  server: MCPServerConfig
  clientStatus?: ClientStatus
  onEdit: (server: MCPServerConfig) => void
  onRemove: (serverName: string) => Promise<void>
  onRefreshStatus?: (serverName: string) => Promise<void>
  loading?: boolean
}

export function ServerCard({ server, clientStatus, onEdit, onRemove, onRefreshStatus, loading = false }: ServerCardProps) {
  const handleRefreshStatus = () => {
    if (onRefreshStatus) {
      onRefreshStatus(server.name)
    }
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {server.name}
          </h3>
          {server.enabled ? (
            clientStatus && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                  clientStatus.connected
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-400'
                }`}>
                  {clientStatus.connected ? (
                    <CheckCircleIcon className="w-3 h-3" />
                  ) : (
                    <XCircleIcon className="w-3 h-3" />
                  )}
                  {clientStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
                {clientStatus.connected && clientStatus.tools > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400 rounded-full text-xs font-medium">
                    <WrenchScrewdriverIcon className="w-3 h-3" />
                    {clientStatus.tools}
                  </span>
                )}
              </div>
            )
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              <NoSymbolIcon className="w-3 h-3" />
              Disabled
            </span>
          )}
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
      
      {server.enabled && clientStatus && clientStatus.last_error && (
        <div className="mb-2 text-xs text-red-600 dark:text-red-400">
          Error: {String(clientStatus.last_error)}
        </div>
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
