import type { ClientStatus } from './types';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface StatusPillProps {
  status: ClientStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  switch (status.state) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
          <CheckCircleIcon className="h-3 w-3" />
          Connected · {status.tools} tools
        </span>
      );
    case 'connecting':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          <ArrowPathIcon className="h-3 w-3 animate-spin" />
          Connecting
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-200 px-2 py-0.5 text-[11px] font-medium text-surface-700 dark:bg-surface-700/40 dark:text-surface-200">
          <XCircleIcon className="h-3 w-3" />
          {status.state.replace('_', ' ')}
        </span>
      );
  }
}
