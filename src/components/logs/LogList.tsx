import { useEffect, useRef } from 'react';
import type { RpcLog } from '../../types/logs';
import { LogListItem } from './LogListItem';

export function LogList({ items, loadMore, hasMore, loading }: {
  items: RpcLog[];
  hasMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void> | void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => (
        <LogListItem key={item.id} item={item} />
      ))}
      <div ref={sentinelRef} />
      {loading && <div className="py-1 text-sm text-surface-500 dark:text-surface-400">Loading…</div>}
      {!hasMore && items.length > 0 && (
        <div className="py-2 text-center text-xs text-surface-400 dark:text-surface-500">End of results</div>
      )}
    </div>
  );
}
