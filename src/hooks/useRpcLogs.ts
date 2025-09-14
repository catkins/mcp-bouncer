import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MCPService } from '../tauri/bridge';
import type { RpcLog, LogsQueryParams } from '../types/logs';
import { on, safeUnlisten, EVENT_LOGS_RPC_EVENT } from '../tauri/events';

export function useRpcLogs(initial: LogsQueryParams & { method?: string; ok?: boolean } = {}) {
  const [items, setItems] = useState<RpcLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [server, setServer] = useState<string | undefined>(initial.server);
  const [method, setMethod] = useState<string | undefined>((initial as any).method);
  const [okFlag, setOkFlag] = useState<boolean | undefined>((initial as any).ok);
  const topTsRef = useRef<number>(0);

  const cursor = useMemo(() => {
    const last = items[items.length - 1];
    return last ? { ts_ms: last.ts_ms, id: last.id } : undefined;
  }, [items]);

  const reset = useCallback(async (opts?: { server?: string }) => {
    setItems([]);
    setHasMore(true);
    if (opts && 'server' in (opts as object)) {
      setServer(opts.server);
      await loadMore({ reset: true, ...(opts.server !== undefined ? { server: opts.server } : {}) });
    } else {
      await loadMore({ reset: true });
    }
  }, []);

  const loadMore = useCallback(async (opts?: { reset?: boolean; server?: string }) => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const params: LogsQueryParams & { method?: string; ok?: boolean } = { limit: 50 } as any;
      const effectiveServer = (opts && 'server' in (opts as object)) ? opts?.server : server;
      if (effectiveServer !== undefined) params.server = effectiveServer;
      if (method !== undefined) (params as any).method = method;
      if (okFlag !== undefined) (params as any).ok = okFlag;
      if (!opts?.reset && cursor) params.after = cursor;
      const page = await MCPService.LogsList(params as any);
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
  }, [cursor, hasMore, loading, server]);

  useEffect(() => {
    // live updates: prepend matching events
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    on(EVENT_LOGS_RPC_EVENT, (e) => {
      const log = e.payload as unknown as RpcLog;
      if (server && log.server_name !== server) return;
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
  }, [server]);

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
    reset,
    loadMore,
  };
}
