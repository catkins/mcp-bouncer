import { useEffect, useState } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';

export function LogsFilterBar({ server, method, ok, onServerChange, onMethodChange, onOkChange }: {
  server?: string;
  method?: string;
  ok?: boolean;
  onServerChange: (s?: string) => void;
  onMethodChange: (m?: string) => void;
  onOkChange: (v?: boolean) => void;
}) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);

  useEffect(() => {
    MCPService.List().then(setServers).catch(() => {});
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
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

      <label className="text-sm text-gray-600 dark:text-gray-300">Method</label>
      <select
        className="px-2 py-1.5 rounded-md bg-white/70 dark:bg-gray-800/70 text-sm border border-gray-200 dark:border-gray-700"
        value={method ?? ''}
        onChange={(e) => onMethodChange(e.target.value || undefined)}
      >
        <option value="">All</option>
        <option value="initialize">initialize</option>
        <option value="listTools">listTools</option>
        <option value="callTool">callTool</option>
        <option value="other">other</option>
      </select>

      <label className="text-sm text-gray-600 dark:text-gray-300">Status</label>
      <select
        className="px-2 py-1.5 rounded-md bg-white/70 dark:bg-gray-800/70 text-sm border border-gray-200 dark:border-gray-700"
        value={ok === undefined ? '' : ok ? 'ok' : 'err'}
        onChange={(e) => onOkChange(e.target.value === '' ? undefined : e.target.value === 'ok')}
      >
        <option value="">All</option>
        <option value="ok">Success</option>
        <option value="err">Errors</option>
      </select>
    </div>
  );
}
