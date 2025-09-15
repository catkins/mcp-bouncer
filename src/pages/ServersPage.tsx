import { useEffect } from 'react';
import { ServerList } from '../components';
import { useServersState } from '../hooks/mcp/useServersState';
import { useClientStatusState } from '../hooks/mcp/useClientStatusState';
import { useMCPActions } from '../hooks/mcp/useMCPActions';
import { useMCPSubscriptions } from '../hooks/mcp/useMCPSubscriptions';

export default function ServersPage() {
  const { servers, setServers, loadServers, loaded: serversLoaded } = useServersState();
  const { clientStatus, loadClientStatus, loaded: statusLoaded } = useClientStatusState();

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
    />
  );
}
