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
    return <BellAlertIcon className="h-4 w-4 text-brand-500" />;
  }
  if (isListToolsMethod(method)) {
    return <WrenchScrewdriverIcon className="h-4 w-4 text-brand-500" />;
  }
  if (isCallToolMethod(method)) {
    return <PlayCircleIcon className="h-4 w-4 text-amber-500" />;
  }
  if (method === 'initialize') {
    return <RocketLaunchIcon className="h-4 w-4 text-brand-500" />;
  }
  return <EllipsisHorizontalCircleIcon className="h-4 w-4 text-surface-500 dark:text-surface-400" />;
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
      classes += ' bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200';
      label = 'Internal';
      break;
    case 'external':
      classes += ' bg-surface-200 text-surface-700 dark:bg-surface-800/60 dark:text-surface-200';
      label = 'External';
      break;
    default:
      classes += ' bg-surface-200 text-surface-700 dark:bg-surface-800/60 dark:text-surface-200';
      label = origin;
      break;
  }
  return <span className={classes}>{label}</span>;
}

export function LogListItem({ item }: { item: RpcLog }) {
  const ts = new Date(item.ts_ms);
  return (
    <div className="rounded-xl border border-surface-200/70 bg-white/90 p-3 shadow-sm transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {methodIcon(item.method)}
          <div className="text-sm font-medium leading-tight text-surface-800 dark:text-white">
            <code className="rounded bg-surface-100 px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-surface-700 dark:bg-surface-800 dark:text-surface-100">
              {item.method}
            </code>
            {item.server_name ? (
              <span className="ml-1 text-xs font-normal text-surface-500 dark:text-surface-400">· {item.server_name}</span>
            ) : null}
            {originBadge(item.origin)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] leading-tight text-surface-600 dark:text-surface-300">
          {item.duration_ms != null && (
            <span className="inline-flex items-center rounded-full bg-surface-200 px-1.5 py-[1px] text-surface-700 dark:bg-surface-700 dark:text-surface-200">
              {item.duration_ms} ms
            </span>
          )}
          {item.ok ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-400/15 px-1.5 py-[1px] text-brand-600 dark:bg-brand-900/30 dark:text-brand-200">
              <CheckCircleIcon className="h-4 w-4" />ok
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-[1px] text-red-600 dark:bg-red-900/30 dark:text-red-300">
              <XCircleIcon className="h-4 w-4" />error
            </span>
          )}
          <span className="text-surface-500 dark:text-surface-400">{format(ts, 'PP p')}</span>
        </div>
      </div>
      <div className="mt-1.5 grid gap-2 md:grid-cols-2 md:items-stretch">
        {item.request_json != null && (
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Request</div>
            <HighlightedJson className="flex-1" value={item.request_json} collapsedByDefault />
          </div>
        )}
        {item.response_json != null && (
          <div className="flex flex-col gap-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">Response</div>
            <HighlightedJson className="flex-1" value={item.response_json} collapsedByDefault />
          </div>
        )}
      </div>
      {!item.ok && item.error && (
        <div className="mt-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-500 dark:bg-red-900/30 dark:text-red-300">
          {item.error}
        </div>
      )}
    </div>
  );
}
