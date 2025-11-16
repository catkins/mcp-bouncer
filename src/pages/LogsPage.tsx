import { useCallback, useEffect, useState } from 'react';
import { LogsFilterBar } from '../components/logs/LogsFilterBar';
import { LogList } from '../components/logs/LogList';
import { LogsHistogram } from '../components/logs/LogsHistogram';
import { useRpcLogs } from '../hooks/useRpcLogs';
import { sqlLoggingService } from '../lib/sqlLogging';
import { LoadingButton } from '../components/LoadingButton';
import { useToast } from '../contexts/ToastContext';

type LogsPageProps = {
  onLogsCleared?: () => void;
};

export function LogsPage({ onLogsCleared }: LogsPageProps = {}) {
  const { items, loading, hasMore, server, method, okFlag, timeRange, reset, loadMore } =
    useRpcLogs();
  const [count, setCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    sqlLoggingService
      .countEvents(server)
      .then(setCount)
      .catch(() => setCount(null));
  }, [server]);

  const handleRangeChange = useCallback(
    (range: { start: number; end: number } | null) => {
      const normalized = range
        ? {
            start: Math.floor(range.start),
            end: Math.ceil(range.end),
          }
        : undefined;
      if (normalized && normalized.end <= normalized.start) return;
      if (normalized) {
        if (
          timeRange &&
          Math.abs(timeRange.start - normalized.start) < 1 &&
          Math.abs(timeRange.end - normalized.end) < 1
        ) {
          return;
        }
        void reset({ range: normalized });
      } else if (timeRange) {
        void reset({ range: undefined });
      }
    },
    [reset, timeRange],
  );

  const handleClearLogs = useCallback(async () => {
    if (count !== null && count === 0) return;
    setClearing(true);
    try {
      await sqlLoggingService.clearEvents();
      setCount(0);
      await reset();
      onLogsCleared?.();
      addToast({ type: 'success', title: 'Logs cleared', message: 'All log entries have been removed.' });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to clear logs',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setClearing(false);
    }
  }, [addToast, count, onLogsCleared, reset]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <LogsFilterBar
          {...(server !== undefined ? { server } : {})}
          {...(method !== undefined ? { method } : {})}
          {...(okFlag !== undefined ? { ok: okFlag } : {})}
          onServerChange={s => reset({ server: s as string | undefined })}
          onMethodChange={m => reset({ method: m as string | undefined })}
          onOkChange={v => reset({ ok: v as boolean | undefined })}
        />
        <div className="flex items-center gap-3 text-xs text-surface-500 dark:text-surface-400">
          <span>{count === null ? '—' : `${count} events`}</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            ariaLabel="Clear logs"
            title="Delete all stored log entries"
            loading={clearing}
            disabled={clearing || count === null || count === 0}
            onClick={handleClearLogs}
          >
            Clear logs
          </LoadingButton>
        </div>
      </div>
      <LogsHistogram
        {...(server !== undefined ? { server } : {})}
        {...(method !== undefined ? { method } : {})}
        {...(okFlag !== undefined ? { ok: okFlag } : {})}
        range={timeRange}
        onRangeChange={handleRangeChange}
      />
      <LogList items={items} hasMore={hasMore} loading={loading} loadMore={loadMore} />
    </div>
  );
}

export default LogsPage;
