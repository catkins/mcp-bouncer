import { useState, useEffect } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { ServerCard } from './ServerCard';
import { ServerForm } from './ServerForm';
import { ToolsModal } from './ToolsModal';
import type { MCPServerConfig, ClientStatus } from '../../tauri/bridge';
import { LoadingButton } from '../LoadingButton';

interface ServerListProps {
  servers: MCPServerConfig[];
  clientStatus: { [key: string]: ClientStatus };
  isLoading?: boolean;
  onAddServer: (server: MCPServerConfig) => Promise<void>;
  onUpdateServer: (name: string, server: MCPServerConfig) => Promise<void>;
  onRemoveServer: (name: string) => Promise<void>;
  onToggleServer: (name: string, enabled: boolean) => Promise<void>;
  onRestartServer: (name: string) => Promise<void>;
  onAuthorizeServer?: (name: string) => Promise<void>;
  onRefreshStatus?: (name: string) => Promise<void>;
  onOpenDebugger?: (name: string) => void;
}

export function ServerList({
  servers,
  clientStatus,
  onAddServer,
  onUpdateServer,
  onRemoveServer,
  onToggleServer,
  onRestartServer,
  onAuthorizeServer,
  isLoading,
  onRefreshStatus: _onRefreshStatus,
  onOpenDebugger,
}: ServerListProps) {
  const [showAddServer, setShowAddServer] = useState<boolean>(false);
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [toolsModalServer, setToolsModalServer] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<Record<string, boolean>>({});
  const [restartLoading, setRestartLoading] = useState<Record<string, boolean>>({});
  const [toggleErrors, setToggleErrors] = useState<Record<string, string | undefined>>({});
  const [removeLoading, setRemoveLoading] = useState<Record<string, boolean>>({});

  // Optional debug logging in dev
  useEffect(() => {
    if (import.meta.env.DEV)
      console.log('ServerList state:', {
        showAddServer,
        editingServer: !!editingServer,
        toolsModalServer,
      });
  }, [showAddServer, editingServer, toolsModalServer]);

  const handleSaveServer = async (serverConfig: MCPServerConfig) => {
    try {
      setFormLoading(true);
      if (editingServer && editingServer.name) {
        await onUpdateServer(editingServer.name, serverConfig);
      } else {
        await onAddServer(serverConfig);
      }
      setShowAddServer(false);
      setEditingServer(null);
    } catch (error) {
      console.error('Failed to save server:', error);
      // Keep modal open on error
    } finally {
      setFormLoading(false);
    }
  };

  const handleCancelServer = () => {
    if (import.meta.env.DEV) console.log('Canceling server form');
    setShowAddServer(false);
    setEditingServer(null);
  };

  const handleEditServer = (server: MCPServerConfig) => {
    if (import.meta.env.DEV) console.log('Editing server:', server.name);
    setEditingServer(server);
  };

  const handleRemoveServer = async (serverName: string) => {
    try {
      setRemoveLoading(prev => ({ ...prev, [serverName]: true }));
      await onRemoveServer(serverName);
    } catch (error) {
      console.error('Failed to remove server:', error);
    } finally {
      setRemoveLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const handleToggle = async (serverName: string, enabled: boolean) => {
    setToggleErrors(prev => ({ ...prev, [serverName]: undefined }));
    setToggleLoading(prev => ({ ...prev, [serverName]: true }));
    try {
      await onToggleServer(serverName, enabled);
    } catch {
      setToggleErrors(prev => ({ ...prev, [serverName]: `Failed to ${enabled ? 'enable' : 'disable'} server` }));
    } finally {
      setToggleLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const handleRestart = async (serverName: string) => {
    setRestartLoading(prev => ({ ...prev, [serverName]: true }));
    try {
      await onRestartServer(serverName);
    } finally {
      setRestartLoading(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const handleAddServer = () => {
    if (import.meta.env.DEV) console.log('Opening add server form');
    setShowAddServer(true);
  };

  const handleOpenTools = (serverName: string) => {
    if (import.meta.env.DEV) console.log('Opening tools modal for server:', serverName);
    setToolsModalServer(serverName);
  };

  const handleCloseTools = () => {
    if (import.meta.env.DEV) console.log('Closing tools modal');
    setToolsModalServer(null);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showAddServer && !editingServer && !toolsModalServer) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
          e.preventDefault()
          handleAddServer();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAddServer, editingServer, toolsModalServer]);

  return (
    <div className="mb-4 space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-surface-900 dark:text-white">Servers</h2>
        <LoadingButton
          onClick={handleAddServer}
          size="sm"
          className="whitespace-nowrap flex-shrink-0 text-xs px-2 py-1 h-6"
        >
          <PlusIcon className="h-3 w-3 inline-block" />
          Add Server
        </LoadingButton>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-surface-200 bg-white/60 p-3 dark:border-surface-700 dark:bg-surface-900/60">
              <div className="mb-2 h-4 w-40 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-3 w-64 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="rounded-lg border border-surface-200 bg-surface-50 py-8 text-center dark:border-surface-700 dark:bg-surface-900">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-200 dark:bg-surface-700">
            <PlusIcon className="h-6 w-6 text-surface-500 dark:text-surface-200" />
          </div>
          <h3 className="mb-1 text-base font-medium text-surface-900 dark:text-white">
            No servers configured
          </h3>
          <p className="mb-4 text-sm text-surface-600 dark:text-surface-300">
            Add your first MCP server to get started
          </p>
          <LoadingButton onClick={handleAddServer} size="sm" className="text-xs px-2 py-1 h-6">
            <PlusIcon className="h-3 w-3 inline-block" />
            Add Server
          </LoadingButton>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server, index) => (
            <div
              key={server.name}
              className="animate-fadeIn"
              style={{
                animationDelay: `${index * 100}ms`,
                animationFillMode: 'both',
              }}
            >
              <ServerCard
                server={server}
                {...(clientStatus[server.name] ? { clientStatus: clientStatus[server.name] } : {})}
                onEdit={handleEditServer}
                onRemove={handleRemoveServer}
                onToggle={handleToggle}
                onRestart={() => handleRestart(server.name)}
                {...(onAuthorizeServer ? { onAuthorize: () => onAuthorizeServer(server.name) } : {})}
                onOpenTools={handleOpenTools}
                {...(onOpenDebugger
                  ? {
                      onOpenDebugger: (serverName: string) => {
                        if (import.meta.env.DEV)
                          console.log('Opening debugger for server:', serverName);
                        onOpenDebugger(serverName);
                      },
                    }
                  : {})}
                loading={removeLoading[server.name] || false}
                toggleLoading={toggleLoading[server.name] || false}
                restartLoading={restartLoading[server.name] || false}
                {...(toggleErrors[server.name]
                  ? { toggleError: toggleErrors[server.name] as string }
                  : {})}
              />
            </div>
          ))}
        </div>
      )}

      {(showAddServer || editingServer) && (
        <ServerForm
          server={editingServer}
          onSave={handleSaveServer}
          onCancel={handleCancelServer}
          loading={formLoading}
          existingServers={servers}
        />
      )}

      {toolsModalServer && (
        <ToolsModal
          serverName={toolsModalServer}
          isOpen={!!toolsModalServer}
          onClose={handleCloseTools}
        />
      )}
    </div>
  );
}
