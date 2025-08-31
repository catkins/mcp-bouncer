import {
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  XCircleIcon,
  NoSymbolIcon,
  CommandLineIcon,
  SignalIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/settings/models';
import { ClientStatus } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp/models';
import { LoadingButton } from './LoadingButton';
import { ToggleSwitch } from './ToggleSwitch';

interface ServerCardProps {
  server: MCPServerConfig;
  clientStatus?: ClientStatus;
  onEdit: (server: MCPServerConfig) => void;
  onRemove: (serverName: string) => Promise<void>;
  onToggle: (serverName: string, enabled: boolean) => Promise<void>;
  onRestart?: () => Promise<void>;
  onRefreshStatus?: (serverName: string) => Promise<void>;
  onOpenTools?: (serverName: string) => void;
  onAuthorize?: (serverName: string) => Promise<void>;
  loading?: boolean;
  toggleLoading?: boolean;
  restartLoading?: boolean;
  toggleError?: string;
}

export function ServerCard({
  server,
  clientStatus,
  onEdit,
  onRemove,
  onToggle,
  onRefreshStatus,
  onRestart,
  onOpenTools,
  onAuthorize,
  loading = false,
  toggleLoading = false,
  restartLoading = false,
  toggleError,
}: ServerCardProps) {
  const handleToolsClick = () => {
    if (clientStatus?.connected && clientStatus.tools > 0 && onOpenTools) {
      onOpenTools(server.name);
    }
  };

  const getTransportIcon = () => {
    switch (server.transport) {
      case 'stdio':
        return <CommandLineIcon className="w-3 h-3" />;
      case 'sse':
        return <SignalIcon className="w-3 h-3" />;
      case 'streamable_http':
        return <GlobeAltIcon className="w-3 h-3" />;
      default:
        return <CommandLineIcon className="w-3 h-3" />;
    }
  };

  return (
    <div
      className={`
      relative p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm
      hover:shadow-md transition-all duration-300 ease-in-out
      ${toggleLoading ? 'animate-pulse' : ''}
      ${loading ? 'opacity-75' : 'opacity-100'}
    `}
    >
      {/* Shimmer effect overlay when loading */}
      {toggleLoading && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer pointer-events-none rounded-lg" />
      )}

      <div className="flex items-start justify-between mb-1.5 relative">
        <div className="flex items-center gap-2">
          <h3
            className={`text-base font-semibold text-gray-900 dark:text-white transition-colors duration-200 ${
              toggleLoading ? 'text-gray-400 dark:text-gray-500' : ''
            }`}
          >
            {server.name}
          </h3>
          {clientStatus && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-all duration-200 ${
                  clientStatus.connected
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-400'
                } ${toggleLoading ? 'animate-pulse' : ''}`}
              >
                {clientStatus.connected ? (
                  <CheckCircleIcon className="w-3 h-3" />
                ) : (
                  <XCircleIcon className="w-3 h-3" />
                )}
                {clientStatus.connected ? 'Connected' : 'Disconnected'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-400 rounded-full text-xs font-medium">
                {getTransportIcon()}
                {server.transport || 'stdio'}
              </span>
              {clientStatus.connected && clientStatus.tools > 0 && (
                <button
                  onClick={handleToolsClick}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400 rounded-full text-xs font-medium transition-all duration-200 hover:bg-blue-200 dark:hover:bg-blue-800/70 hover:scale-105 active:scale-95 cursor-pointer ${
                    toggleLoading ? 'animate-pulse' : ''
                  }`}
                  title="Click to manage tools"
                >
                  <WrenchScrewdriverIcon className="w-3 h-3" />
                  {clientStatus.tools}
                </button>
              )}
              {!clientStatus.connected && clientStatus.authorization_required && (
                <button
                  onClick={() => onAuthorize && onAuthorize(server.name)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400 rounded-full text-xs font-medium transition-all duration-200 hover:bg-amber-200 dark:hover:bg-amber-800/70 hover:scale-105 active:scale-95 cursor-pointer ${
                    toggleLoading ? 'animate-pulse' : ''
                  }`}
                  title="Authorization required"
                >
                  <KeyIcon className="w-3 h-3" />
                  Authorize
                </button>
              )}
              {clientStatus?.oauth_authenticated && (
                <span
                  className="inline-flex items-center p-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400 rounded-full"
                  title="OAuth Authenticated"
                >
                  <ShieldCheckIcon className="w-3 h-3" />
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {server.enabled && (
            <LoadingButton
              onClick={onRestart}
              disabled={loading || toggleLoading}
              loading={restartLoading}
              variant="secondary"
              size="sm"
              className={`p-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-50' : ''}`}
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
            </LoadingButton>
          )}
          <div className={`transition-all duration-200 ${toggleLoading ? 'animate-pulse' : ''}`}>
            <ToggleSwitch
              checked={server.enabled}
              onChange={enabled => onToggle(server.name, enabled)}
              disabled={loading || toggleLoading}
              size="sm"
              className="mr-2"
            />
          </div>
          <LoadingButton
            onClick={() => onEdit(server)}
            disabled={loading || toggleLoading}
            variant="secondary"
            size="sm"
            className={`p-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-50' : ''}`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </LoadingButton>
          <LoadingButton
            onClick={() => onRemove(server.name)}
            loading={loading}
            variant="danger"
            size="sm"
            className={`p-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-50' : ''}`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </LoadingButton>
        </div>
      </div>

      {server.description && (
        <p
          className={`text-sm text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200 ${
            toggleLoading ? 'text-gray-400 dark:text-gray-500' : ''
          }`}
        >
          {server.description}
        </p>
      )}

      {/* Show toggle error if present */}
      {toggleError && (
        <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md animate-fadeIn">
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <XCircleIcon className="w-3 h-3 flex-shrink-0" />
            <span>{toggleError}</span>
          </div>
        </div>
      )}

      {/* Show client error if present */}
      {server.enabled && clientStatus && clientStatus.last_error && !toggleError && (
        <div className="mb-2 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md animate-fadeIn">
          <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
            <NoSymbolIcon className="w-3 h-3 flex-shrink-0" />
            <span>Connection error: {String(clientStatus.last_error)}</span>
          </div>
        </div>
      )}

      <div
        className={`space-y-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-75' : ''}`}
      >
        {/* stdio transport fields */}
        {(server.transport === 'stdio' || !server.transport) && (
          <>
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Command:</span>
              <code className="ml-2 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                {server.command}
              </code>
            </div>

            {server.args && server.args.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
                  Arguments:
                </span>
                <div className="flex flex-wrap gap-1">
                  {server.args.map((arg, index) => (
                    <code
                      key={index}
                      className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono"
                    >
                      {arg}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {server.env && Object.keys(server.env).length > 0 && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Environment:
                </span>
                <div className="mt-1 space-y-1">
                  {Object.entries(server.env).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                        {key}={value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* HTTP transport fields (SSE and streamable HTTP) */}
        {(server.transport === 'sse' || server.transport === 'streamable_http') && (
          <>
            {server.endpoint && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Endpoint:
                </span>
                <code className="ml-2 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                  {server.endpoint}
                </code>
              </div>
            )}

            {server.headers && Object.keys(server.headers).length > 0 && (
              <div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Headers:
                </span>
                <div className="mt-1 space-y-1">
                  {Object.entries(server.headers).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
                        {key}: {value}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
