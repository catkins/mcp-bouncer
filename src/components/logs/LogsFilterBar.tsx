import { useEffect, useState } from 'react';
import { MCPService, type MCPServerConfig } from '../../tauri/bridge';
import { DropdownSelect } from '../DropdownSelect';

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

  const methodOptions = [
    { value: '', label: 'All' },
    { value: 'initialize', label: 'initialize' },
    { value: 'tools/list', label: 'tools/list' },
    { value: 'tools/call', label: 'tools/call' },
    { value: 'notifications/message', label: 'notifications/message' },
    { value: 'other', label: 'other' },
  ];

  return (
    <div className="mb-3 flex flex-wrap items-end gap-4 text-sm text-gray-600 dark:text-gray-300">
      <DropdownSelect
        label="Server"
        size="sm"
        value={server ?? ''}
        onChange={event => onServerChange(event.target.value || undefined)}
        options={[
          { value: '', label: 'All' },
          ...servers.map(s => ({ value: s.name, label: s.name })),
        ]}
        className="w-44"
      />

      <DropdownSelect
        label="Method"
        size="sm"
        value={method ?? ''}
        onChange={event => onMethodChange(event.target.value || undefined)}
        options={methodOptions}
        className="w-44"
      />

      <DropdownSelect
        label="Status"
        size="sm"
        value={ok === undefined ? '' : ok ? 'ok' : 'err'}
        onChange={event =>
          onOkChange(event.target.value === '' ? undefined : event.target.value === 'ok')
        }
        options={[
          { value: '', label: 'All' },
          { value: 'ok', label: 'Success' },
          { value: 'err', label: 'Errors' },
        ]}
        className="w-44"
      />
    </div>
  );
}
