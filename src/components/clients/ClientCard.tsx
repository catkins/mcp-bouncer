import { useEffect, useState } from 'react';
import type { IncomingClient } from '../../hooks/useIncomingClients';
import { ClockIcon } from '@heroicons/react/24/outline';
import { timeAgo } from '../../utils/date';

export function ClientCard({ client }: { client: IncomingClient }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const tooltip = client.connected_at ? new Date(client.connected_at).toLocaleString() : '';

  return (
    <div className="p-4 rounded-xl border border-surface-200 bg-white/95 shadow-sm transition-all duration-300 hover:shadow-md dark:border-surface-700 dark:bg-surface-900">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-surface-900 dark:text-white">{client.name}</h3>
            <span className="px-2 py-0.5 text-xs bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200 rounded-full">
              v{client.version}
            </span>
          </div>
          {client.title && (
            <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">{client.title}</p>
          )}
        </div>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-100 dark:bg-surface-700 text-surface-800 dark:text-surface-200 rounded-full text-xs font-medium"
          title={tooltip}
          data-tick={tick}
        >
          <ClockIcon className="w-3 h-3" />
          Connected {timeAgo(client.connected_at)}
        </span>
      </div>
    </div>
  );
}
