import { DropdownSelect } from '../DropdownSelect';
import type { ClientStatus, DebuggerServerOption } from './types';
import { StatusPill } from './StatusPill';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';

interface DebuggerHeaderProps {
  selectedServer: string | null;
  serverOptions: DebuggerServerOption[];
  status?: ClientStatus;
  onSelectServer: (name: string | null) => void;
  serverEligible: boolean;
}

export function DebuggerHeader({
  selectedServer,
  serverOptions,
  status,
  onSelectServer,
  serverEligible,
}: DebuggerHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-surface-200/80 bg-white/90 p-4 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Tool Debugger</h2>
        {selectedServer ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-600 dark:text-surface-300">
            <span>{selectedServer}</span>
            {status ? <StatusPill status={status} /> : null}
            {!serverEligible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <ExclamationCircleIcon className="h-3 w-3" />
                Not connected
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Select a connected server to inspect its tools.
          </p>
        )}
      </div>
      <DropdownSelect
        label="Server"
        size="sm"
        value={selectedServer ?? ''}
        onChange={event => onSelectServer(event.target.value || null)}
        options={[
          { value: '', label: 'Choose server', disabled: true },
          ...serverOptions.map(option => ({ value: option.name, label: option.name })),
        ]}
        className="w-56"
      />
    </div>
  );
}
