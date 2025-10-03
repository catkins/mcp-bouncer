import { useEffect, useState } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

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

  const selectClass =
    'w-44 px-3 py-2 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 dark:focus:border-purple-400 text-sm appearance-none cursor-pointer transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-600';

  const methodOptions = [
    { value: '', label: 'All' },
    { value: 'initialize', label: 'initialize' },
    { value: 'tools/list', label: 'tools/list' },
    { value: 'tools/call', label: 'tools/call' },
    { value: 'notifications/message', label: 'notifications/message' },
    { value: 'other', label: 'other' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4 mb-3">
      <label className="text-sm text-gray-600 dark:text-gray-300">Server</label>
      <div className="relative">
        <select
          className={selectClass}
          value={server ?? ''}
          onChange={(e) => onServerChange(e.target.value || undefined)}
        >
          <option value="">All</option>
          {servers.map(s => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      </div>

      <label className="text-sm text-gray-600 dark:text-gray-300">Method</label>
      <div className="relative">
        <select
          className={selectClass}
          value={method ?? ''}
          onChange={(e) => onMethodChange(e.target.value || undefined)}
        >
          {methodOptions.map((opt) => (
            <option key={opt.value || '__all__'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      </div>

      <label className="text-sm text-gray-600 dark:text-gray-300">Status</label>
      <div className="relative">
        <select
          className={selectClass}
          value={ok === undefined ? '' : ok ? 'ok' : 'err'}
          onChange={(e) => onOkChange(e.target.value === '' ? undefined : e.target.value === 'ok')}
        >
          <option value="">All</option>
          <option value="ok">Success</option>
          <option value="err">Errors</option>
        </select>
        <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
      </div>
    </div>
  );
}
