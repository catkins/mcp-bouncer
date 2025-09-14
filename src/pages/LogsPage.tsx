import { useEffect, useState } from 'react';
import { LogsFilterBar } from '../components/logs/LogsFilterBar';
import { LogList } from '../components/logs/LogList';
import { useRpcLogs } from '../hooks/useRpcLogs';
import { MCPService } from '../tauri/bridge';

export function LogsPage() {
  const { items, loading, hasMore, server, setServer, reset, loadMore } = useRpcLogs();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    MCPService.LogsCount(server).then(setCount).catch(() => setCount(null));
  }, [server]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <LogsFilterBar
          {...(server !== undefined ? { server } : {})}
          onServerChange={(s) => (s !== undefined ? reset({ server: s }) : reset())}
        />
        <div className="text-xs text-gray-500">{count === null ? '—' : `${count} events`}</div>
      </div>
      <LogList items={items} hasMore={hasMore} loading={loading} loadMore={loadMore} />
    </div>
  );
}

export default LogsPage;
