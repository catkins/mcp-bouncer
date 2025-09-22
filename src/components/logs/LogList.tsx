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
      {loading && <div className="text-sm text-gray-500 py-1">Loading…</div>}
      {!hasMore && items.length > 0 && (
        <div className="text-xs text-gray-400 text-center py-2">End of results</div>
      )}
    </div>
  );
}
