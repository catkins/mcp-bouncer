import { format } from 'date-fns';
import { CheckCircleIcon, XCircleIcon, RocketLaunchIcon, WrenchScrewdriverIcon, PlayCircleIcon, EllipsisHorizontalCircleIcon, BellAlertIcon } from '@heroicons/react/20/solid';
import type { RpcLog } from '../../types/logs';
import { HighlightedJson } from './HighlightedJson';

function isNotificationMethod(method: string) {
  return method.startsWith('notifications/');
}

function isListToolsMethod(method: string) {
  return method === 'tools/list';
}

function isCallToolMethod(method: string) {
  return method === 'tools/call';
}

function methodIcon(method: string) {
  if (isNotificationMethod(method)) {
    return <BellAlertIcon className="h-4 w-4 text-teal-500" />;
  }
  if (isListToolsMethod(method)) {
    return <WrenchScrewdriverIcon className="h-4 w-4 text-purple-500" />;
  }
  if (isCallToolMethod(method)) {
    return <PlayCircleIcon className="h-4 w-4 text-amber-500" />;
  }
  if (method === 'initialize') {
    return <RocketLaunchIcon className="h-4 w-4 text-blue-500" />;
  }
  return <EllipsisHorizontalCircleIcon className="h-4 w-4 text-gray-400" />;
}

function originBadge(origin?: string | null) {
  if (!origin) return null;
  const normalized = origin.toLowerCase();
  let label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  let classes = 'ml-1 inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-semibold';
  switch (normalized) {
    case 'debugger':
      classes += ' bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      label = 'Debugger';
      break;
    case 'internal':
      classes += ' bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200';
      label = 'Internal';
      break;
    case 'external':
      classes += ' bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:text-gray-200';
      label = 'External';
      break;
    default:
      classes += ' bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:text-gray-200';
      label = origin;
      break;
  }
  return <span className={classes}>{label}</span>;
}

export function LogListItem({ item }: { item: RpcLog }) {
  const ts = new Date(item.ts_ms);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 p-2.5 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {methodIcon(item.method)}
          <div className="text-sm font-medium leading-tight text-gray-800 dark:text-gray-100">
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {item.method}
            </code>
            {item.server_name ? (
              <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">· {item.server_name}</span>
            ) : null}
            {originBadge(item.origin)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] leading-tight text-gray-600 dark:text-gray-300">
          {item.duration_ms != null && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-[1px] text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {item.duration_ms} ms
            </span>
          )}
          {item.ok ? (
            <span className="inline-flex items-center gap-1 text-green-600"><CheckCircleIcon className="h-4 w-4"/>ok</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600"><XCircleIcon className="h-4 w-4"/>error</span>
          )}
          <span className="text-gray-500 dark:text-gray-400">{format(ts, 'PP p')}</span>
        </div>
      </div>
      <div className="mt-1.5 grid gap-2 md:grid-cols-2 md:items-stretch">
        {item.request_json != null && (
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Request</div>
            <HighlightedJson className="flex-1" value={item.request_json} collapsedByDefault />
          </div>
        )}
        {item.response_json != null && (
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Response</div>
            <HighlightedJson className="flex-1" value={item.response_json} collapsedByDefault />
          </div>
        )}
      </div>
      {!item.ok && item.error && (
        <div className="mt-1.5 text-[11px] text-red-600">{item.error}</div>
      )}
    </div>
  );
}
