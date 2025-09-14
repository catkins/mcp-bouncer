import { useEffect, useState } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';

export function LogsFilterBar({ server, onServerChange }: {
  server?: string;
  onServerChange: (s?: string) => void;
}) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);

  useEffect(() => {
    MCPService.List().then(setServers).catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-3 mb-3">
      <label className="text-sm text-gray-600 dark:text-gray-300">Server</label>
      <select
        className="px-2 py-1.5 rounded-md bg-white/70 dark:bg-gray-800/70 text-sm border border-gray-200 dark:border-gray-700"
        value={server ?? ''}
        onChange={(e) => onServerChange(e.target.value || undefined)}
      >
        <option value="">All</option>
        {servers.map(s => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
      </select>
    </div>
  );
}

