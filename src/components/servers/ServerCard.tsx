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
  BugAntIcon,
} from '@heroicons/react/24/outline';
import type { MCPServerConfig, ClientStatus } from '../../tauri/bridge';
import { LoadingButton } from '../LoadingButton';
import { ToggleSwitch } from '../ToggleSwitch';

interface ServerCardProps {
  server: MCPServerConfig;
  clientStatus?: ClientStatus;
  onEdit: (server: MCPServerConfig) => void;
  onRemove: (serverName: string) => Promise<void>;
  onToggle: (serverName: string, enabled: boolean) => Promise<void>;
  onRestart?: () => Promise<void>;
  onOpenTools?: (serverName: string) => void;
  onOpenDebugger?: (serverName: string) => void;
  onAuthorize?: (serverName: string) => Promise<void>;
  loading?: boolean;
  toggleLoading?: boolean;
  restartLoading?: boolean;
  toggleError?: string;
}

function getTransportIcon(transport: MCPServerConfig['transport']) {
  switch (transport) {
    case 'stdio':
      return <CommandLineIcon className="w-3 h-3" />;
    case 'sse':
      return <SignalIcon className="w-3 h-3" />;
    case 'streamable_http':
      return <GlobeAltIcon className="w-3 h-3" />;
    default:
      return <CommandLineIcon className="w-3 h-3" />;
  }
}

function TransportBadge({ transport }: { transport: MCPServerConfig['transport'] }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-400 rounded-full text-xs font-medium">
      {getTransportIcon(transport)}
      {transport || 'stdio'}
    </span>
  );
}

function ToolsButton({ clientStatus, toggleLoading, onClick, serverName }: { clientStatus?: ClientStatus; toggleLoading: boolean; onClick: () => void; serverName: string }) {
  if (!(clientStatus?.state === 'connected' && clientStatus.tools > 0)) return null;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400 rounded-full text-xs font-medium transition-all duration-200 hover:bg-blue-200 dark:hover:bg-blue-800/70 hover:scale-105 active:scale-95 cursor-pointer ${toggleLoading ? 'animate-pulse' : ''}`}
      title="Click to manage tools"
      aria-label={`Open tools for ${serverName}`}
    >
      <WrenchScrewdriverIcon className="w-3 h-3" />
      {clientStatus.tools}
    </button>
  );
}

function ClientStatusBadge({ clientStatus, toggleLoading, transport, onAuthorize, serverName }: {
  clientStatus?: ClientStatus;
  toggleLoading: boolean;
  transport: MCPServerConfig['transport'];
  onAuthorize?: ((serverName: string) => Promise<void>) | undefined;
  serverName: string;
}) {
  if (!clientStatus) return null;
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-all duration-200';
  const pulse = toggleLoading ? ' animate-pulse' : '';

  if (clientStatus.state === 'connected')
    return (
      <span className={`${base} bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400${pulse}`}>
        <CheckCircleIcon className="w-3 h-3" />
        Connected
      </span>
    );

  if (clientStatus.state === 'connecting')
    return (
      <span className={`${base} bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400${pulse}`}>
        <ArrowPathIcon className="w-3 h-3 animate-spin" />
        Connecting
      </span>
    );

  if (clientStatus.state === 'errored')
    return (
      <span className={`${base} bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-400${pulse}`}>
        <XCircleIcon className="w-3 h-3" />
        Error
      </span>
    );

  if (clientStatus.state === 'requires_authorization') {
    const content = (
      <>
        <KeyIcon className="w-3 h-3" />
        Authorization required
      </>
    );
    if (transport === 'streamable_http' && onAuthorize) {
      return (
        <button
          onClick={() => onAuthorize(serverName)}
          className={`${base} bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800/70 hover:scale-105 active:scale-95 cursor-pointer${pulse}`}
          title="Authorization required"
          aria-label={`Authorize ${serverName}`}
        >
          {content}
        </button>
      );
    }
    return (
      <span className={`${base} bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400${pulse}`}>
        {content}
      </span>
    );
  }

  if (clientStatus.state === 'authorizing')
    return (
      <span className={`${base} bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-400${pulse}`}>
        <ArrowPathIcon className="w-3 h-3 animate-spin" />
        Authorizing
      </span>
    );

  return (
    <span className={`${base} bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300${pulse}`}>
      <NoSymbolIcon className="w-3 h-3" />
      Disconnected
    </span>
  );
}

// Transport detail sections
function StdioTransportFields({ command, args, env }: { command: string; args?: string[] | undefined; env?: Partial<Record<string, string>> | undefined }) {
  return (
    <>
      <div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Command:</span>
        <code className="ml-2 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
          {command}
        </code>
      </div>

      {(args ?? []).length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
            Arguments:
          </span>
          <div className="flex flex-wrap gap-1">
            {(args ?? []).map((arg: string, index: number) => (
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

      {env && Object.keys(env as Record<string, string>).length > 0 && (
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Environment:
          </span>
          <div className="mt-1 space-y-1">
            {Object.entries((env ?? {}) as Record<string, string>).map(([key, value]) => (
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
  );
}

function HttpTransportFields({ endpoint, headers }: { endpoint?: string | undefined; headers?: Partial<Record<string, string>> | undefined }) {
  return (
    <>
      {endpoint && (
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Endpoint:
          </span>
          <code className="ml-2 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-mono">
            {endpoint}
          </code>
        </div>
      )}

      {headers && Object.keys(headers as Record<string, string>).length > 0 && (
        <div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Headers:
          </span>
          <div className="mt-1 space-y-1">
            {Object.entries((headers ?? {}) as Record<string, string>).map(([key, value]) => (
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
  );
}

export function ServerCard({
  server,
  clientStatus,
  onEdit,
  onRemove,
  onToggle,
  onRestart,
  onOpenTools,
  onOpenDebugger,
  onAuthorize,
  loading = false,
  toggleLoading = false,
  restartLoading = false,
  toggleError,
}: ServerCardProps) {
  const handleToolsClick = () => {
    if (clientStatus?.state === 'connected' && clientStatus.tools > 0 && onOpenTools) {
      onOpenTools(server.name);
    }
  };

  const handleDebuggerClick = () => {
    if (clientStatus?.state === 'connected' && onOpenDebugger) {
      onOpenDebugger(server.name);
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
            className={`text-base font-semibold text-gray-900 dark:text-white transition-colors duration-200 ${toggleLoading ? 'text-gray-400 dark:text-gray-500' : ''}`}
          >
            {server.name}
          </h3>
          {clientStatus && (
            <div className="flex items-center gap-2">
              <ClientStatusBadge
                clientStatus={clientStatus}
                toggleLoading={toggleLoading}
                transport={server.transport}
                onAuthorize={onAuthorize}
                serverName={server.name}
              />
              <TransportBadge transport={server.transport} />
              <ToolsButton
                clientStatus={clientStatus}
                toggleLoading={toggleLoading}
                onClick={handleToolsClick}
                serverName={server.name}
              />
              {clientStatus?.state === 'connected' && onOpenDebugger && (
                <button
                  onClick={handleDebuggerClick}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200/90 dark:hover:bg-amber-800/60 hover:scale-105 active:scale-95 ${toggleLoading ? 'pointer-events-none opacity-60' : ''}`}
                  title="Open debugger"
                  aria-label={`Open debugger for ${server.name}`}
                >
                  <BugAntIcon className="w-3 h-3" />
                  Debug
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
          {server.enabled && onRestart && (
            <LoadingButton
              onClick={onRestart}
              disabled={loading || toggleLoading}
              loading={restartLoading}
              variant="secondary"
              size="sm"
              className={`p-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-50' : ''}`}
              ariaLabel={`Restart ${server.name}`}
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
            ariaLabel={`Edit ${server.name}`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </LoadingButton>
          <LoadingButton
            onClick={() => onRemove(server.name)}
            loading={loading}
            variant="danger"
            size="sm"
            className={`p-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-50' : ''}`}
            ariaLabel={`Remove ${server.name}`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </LoadingButton>
        </div>
      </div>

      {server.description && (
        <p
          className={`text-sm text-gray-600 dark:text-gray-400 mb-2 transition-colors duration-200 ${toggleLoading ? 'text-gray-400 dark:text-gray-500' : ''}`}
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

      {/* Show client error if present (but not when auth is required/authorizing) */}
      {server.enabled &&
        clientStatus &&
        clientStatus.last_error &&
        !toggleError &&
        clientStatus.state !== 'requires_authorization' &&
        clientStatus.state !== 'authorizing' && (
          <div className="mb-2 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md animate-fadeIn">
            <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
              <NoSymbolIcon className="w-3 h-3 flex-shrink-0" />
              <span>Connection error: {String(clientStatus.last_error)}</span>
            </div>
          </div>
        )}

      <div className={`space-y-1.5 transition-all duration-200 ${toggleLoading ? 'opacity-75' : ''}`}>
        {/* stdio transport fields */}
        {server.transport === 'stdio' && (
          <StdioTransportFields command={server.command} args={server.args} env={server.env} />
        )}

        {/* HTTP transport fields (SSE and streamable HTTP) */}
        {(server.transport === 'sse' || server.transport === 'streamable_http') && (
          <HttpTransportFields endpoint={server.endpoint} headers={server.headers} />
        )}
      </div>
    </div>
  );
}
