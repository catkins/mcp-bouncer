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
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          <ArrowPathIcon className="h-3 w-3 animate-spin" />
          Connecting
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-700/40 dark:text-gray-200">
          <XCircleIcon className="h-3 w-3" />
          {status.state.replace('_', ' ')}
        </span>
      );
  }
}
