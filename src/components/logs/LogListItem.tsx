import { format } from 'date-fns';
import { CheckCircleIcon, XCircleIcon, RocketLaunchIcon, WrenchScrewdriverIcon, PlayCircleIcon, EllipsisHorizontalCircleIcon } from '@heroicons/react/20/solid';
import type { RpcLog } from '../../types/logs';

function methodIcon(method: string) {
  switch (method) {
    case 'initialize':
      return <RocketLaunchIcon className="h-5 w-5 text-blue-500" />;
    case 'listTools':
      return <WrenchScrewdriverIcon className="h-5 w-5 text-purple-500" />;
    case 'callTool':
      return <PlayCircleIcon className="h-5 w-5 text-amber-500" />;
    default:
      return <EllipsisHorizontalCircleIcon className="h-5 w-5 text-gray-400" />;
  }
}

export function LogListItem({ item }: { item: RpcLog }) {
  const ts = new Date(item.ts_ms);
  return (
    <div className="p-3 rounded-md bg-white/80 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {methodIcon(item.method)}
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {item.method} {item.server_name ? <span className="ml-2 text-gray-500">· {item.server_name}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {item.duration_ms != null && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{item.duration_ms} ms</span>
          )}
          {item.ok ? (
            <span className="inline-flex items-center gap-1 text-green-600"><CheckCircleIcon className="h-4 w-4"/>ok</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600"><XCircleIcon className="h-4 w-4"/>error</span>
          )}
          <span className="text-gray-500">{format(ts, 'PP p')}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {item.request_json != null && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Request</div>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900/60 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-auto max-h-64">
              {JSON.stringify(item.request_json, null, 2)}
            </pre>
          </div>
        )}
        {item.response_json != null && (
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Response</div>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900/60 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-auto max-h-64">
              {JSON.stringify(item.response_json, null, 2)}
            </pre>
          </div>
        )}
      </div>
      {!item.ok && item.error && (
        <div className="mt-2 text-xs text-red-600">{item.error}</div>
      )}
    </div>
  );
}

