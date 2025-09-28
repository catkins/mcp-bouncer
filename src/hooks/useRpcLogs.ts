import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sqlLoggingService } from '../lib/sqlLogging';
import type { RpcLog, LogsQueryParams } from '../types/logs';
import { on, safeUnlisten, EVENT_LOGS_RPC_EVENT } from '../tauri/events';

type TimeRange = { start: number; end: number };

export function useRpcLogs(initial: LogsQueryParams & { method?: string; ok?: boolean } = {}) {
  const [items, setItems] = useState<RpcLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [server, setServer] = useState<string | undefined>(initial.server);
  const [method, setMethod] = useState<string | undefined>((initial as any).method);
  const [okFlag, setOkFlag] = useState<boolean | undefined>((initial as any).ok);
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(
    initial.start_ts_ms != null && initial.end_ts_ms != null
      ? { start: initial.start_ts_ms, end: initial.end_ts_ms }
      : undefined,
  );
  const topTsRef = useRef<number>(0);

  const cursor = useMemo(() => {
    const last = items[items.length - 1];
    return last ? { ts_ms: last.ts_ms, id: last.id } : undefined;
  }, [items]);

  const buildFilters = useCallback(
    (opts?: { server?: string | undefined; method?: string | undefined; ok?: boolean | undefined; range?: TimeRange | undefined }) => {
      const effectiveServer = opts && 'server' in (opts as object) ? opts.server : server;
      const effectiveMethod = opts && 'method' in (opts as object) ? opts.method : method;
      const effectiveOk = opts && 'ok' in (opts as object) ? opts.ok : okFlag;
      const effectiveRange = opts && 'range' in (opts as object) ? opts.range : timeRange;
      const params: LogsQueryParams & { method?: string; ok?: boolean } = { limit: 50 } as any;
      if (effectiveServer !== undefined) params.server = effectiveServer;
      if (effectiveMethod !== undefined) (params as any).method = effectiveMethod;
      if (effectiveOk !== undefined) (params as any).ok = effectiveOk;
      if (effectiveRange) {
        params.start_ts_ms = effectiveRange.start;
        params.end_ts_ms = effectiveRange.end;
      }
      return { params, effectiveServer, effectiveMethod, effectiveOk, effectiveRange };
    },
    [server, method, okFlag, timeRange],
  );

  const loadMore = useCallback(async (opts?: {
    reset?: boolean;
    server?: string | undefined;
    method?: string | undefined;
    ok?: boolean | undefined;
    range?: TimeRange | undefined;
  }) => {
    if (loading || (!hasMore && !opts?.reset)) return;
    setLoading(true);
    try {
      const { params } = buildFilters(opts);
      if (!opts?.reset && cursor) params.after = cursor;
      const page = await sqlLoggingService.queryEvents(params as any);
      if (opts?.reset) {
        setItems(page);
      } else {
        setItems(prev => [...prev, ...page]);
      }
      setHasMore(page.length >= 50);
      if (page[0]) topTsRef.current = Math.max(topTsRef.current, page[0].ts_ms);
    } finally {
      setLoading(false);
    }
  }, [buildFilters, cursor, hasMore, loading]);

  const reset = useCallback(async (opts?: {
    server?: string | undefined;
    method?: string | undefined;
    ok?: boolean | undefined;
    range?: TimeRange | undefined;
  }) => {
    const { effectiveServer, effectiveMethod, effectiveOk, effectiveRange } = buildFilters(opts);
    if (opts && 'server' in (opts as object)) setServer(opts.server);
    if (opts && 'method' in (opts as object)) setMethod(opts.method);
    if (opts && 'ok' in (opts as object)) setOkFlag(opts.ok);
    if (opts && 'range' in (opts as object)) setTimeRange(opts.range);
    setHasMore(true);
    setLoading(true);
    try {
      const { params } = buildFilters({ server: effectiveServer, method: effectiveMethod, ok: effectiveOk, range: effectiveRange });
      const page = await sqlLoggingService.queryEvents(params as any);
      setItems(page);
      setHasMore(page.length >= 50);
      if (page[0]) topTsRef.current = Math.max(page[0].ts_ms, topTsRef.current);
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    // live updates: prepend matching events
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    on(EVENT_LOGS_RPC_EVENT, (e) => {
      const log = e.payload as unknown as RpcLog;
      if (server && log.server_name !== server) return;
      if (method && log.method !== method) return;
      if (okFlag !== undefined && log.ok !== okFlag) return;
      if (timeRange && (log.ts_ms < timeRange.start || log.ts_ms > timeRange.end)) return;
      setItems(prev => [log, ...prev]);
      topTsRef.current = Math.max(topTsRef.current, log.ts_ms);
    }).then(u => (cancelled ? safeUnlisten(u) : unsubs.push(u))).catch(() => {});
    return () => {
      cancelled = true;
      while (unsubs.length) {
        const u = unsubs.pop();
        if (u) safeUnlisten(u);
      }
    };
  }, [server, method, okFlag, timeRange]);

  return {
    items,
    loading,
    hasMore,
    server,
    setServer,
    method,
    setMethod,
    okFlag,
    setOkFlag,
    timeRange,
    reset,
    loadMore,
  };
}
