import { useEffect, useState } from 'react';
import type { IncomingClient } from '../hooks/useIncomingClients';
import { ClockIcon } from '@heroicons/react/24/outline';

function timeAgo(input: string | Date | null): string {
  if (!input) return '-';
  const ts = new Date(input).getTime();
  if (isNaN(ts)) return '-';
  const now = Date.now();
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ClientCard({ client }: { client: IncomingClient }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const tooltip = client.connected_at ? new Date(client.connected_at).toLocaleString() : '';

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{client.name}</h3>
            <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full">
              v{client.version}
            </span>
          </div>
          {client.title && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{client.title}</p>
          )}
        </div>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium"
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
