import { useCallback, useEffect, useState } from 'react';
import { LogsFilterBar } from '../components/logs/LogsFilterBar';
import { LogList } from '../components/logs/LogList';
import { LogsHistogram } from '../components/logs/LogsHistogram';
import { useRpcLogs } from '../hooks/useRpcLogs';
import { sqlLoggingService } from '../lib/sqlLogging';

export function LogsPage() {
  const { items, loading, hasMore, server, method, okFlag, timeRange, reset, loadMore } =
    useRpcLogs();
  const [count, setCount] = useState<number | null>(null);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <LogsFilterBar
          {...(server !== undefined ? { server } : {})}
          {...(method !== undefined ? { method } : {})}
          {...(okFlag !== undefined ? { ok: okFlag } : {})}
          onServerChange={s => reset({ server: s as string | undefined })}
          onMethodChange={m => reset({ method: m as string | undefined })}
          onOkChange={v => reset({ ok: v as boolean | undefined })}
        />
        <div className="text-xs text-gray-500">{count === null ? '—' : `${count} events`}</div>
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
