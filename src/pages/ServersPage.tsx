import { useEffect } from 'react';
import { ServerList } from '../components/servers/ServerList';
import { useServersState } from '../hooks/mcp/useServersState';
import { useMCPActions } from '../hooks/mcp/useMCPActions';
import { useMCPSubscriptions } from '../hooks/mcp/useMCPSubscriptions';
import type { ClientStatus } from '../tauri/bridge';

interface ServersPageProps {
  clientStatus: Record<string, ClientStatus>;
  loadClientStatus: () => Promise<void>;
  statusLoaded: boolean;
  onOpenDebugger: (serverName: string) => void;
}

export default function ServersPage({
  clientStatus,
  loadClientStatus,
  statusLoaded,
  onOpenDebugger,
}: ServersPageProps) {
  const { servers, setServers, loadServers, loaded: serversLoaded } = useServersState();

  const { addServer, updateServer, removeServer, toggleServer, restartServer, authorizeServer } = useMCPActions({
    servers,
    setServers: (updater: (prev: typeof servers) => typeof servers) => setServers(prev => updater(prev)),
    // No external loading/error collectors here; the list handles its own small spinners
    setLoadingStates: () => {},
    setErrors: () => {},
    loadServers,
    loadClientStatus,
  } as any);

  useEffect(() => {
    // Kick initial loads (in parallel)
    Promise.allSettled([loadServers(), loadClientStatus()]);
    return () => {};
  }, [loadServers, loadClientStatus]);

  // Subscribe to MCP events to keep servers/status in sync
  useMCPSubscriptions({
    loadServers,
    loadActive: async () => {},
    loadSettings: async () => {},
    loadMcpUrl: async () => {},
    loadClientStatus,
  });

  const handleRefreshStatus = async (_: string) => {
    await loadClientStatus();
  };

  return (
    <ServerList
      servers={servers}
      clientStatus={clientStatus}
      isLoading={!serversLoaded || !statusLoaded}
      onAddServer={addServer}
      onUpdateServer={updateServer}
      onRemoveServer={removeServer}
      onToggleServer={toggleServer}
      onRestartServer={restartServer}
      onAuthorizeServer={authorizeServer}
      onRefreshStatus={handleRefreshStatus}
      onOpenDebugger={onOpenDebugger}
    />
  );
}
