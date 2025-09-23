import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { format } from 'date-fns';
import type { LogsHistogram as LogsHistogramPayload } from '../../types/logs';
import { MCPService } from '../../tauri/bridge';
import { EVENT_LOGS_RPC_EVENT, on, safeUnlisten } from '../../tauri/events';

const METHOD_COLORS: Record<MethodCategory, string> = {
  initialize: '#3B82F6',
  listTools: '#A855F7',
  callTool: '#F59E0B',
  other: '#9CA3AF',
};

const METHOD_LABELS: Record<MethodCategory, string> = {
  initialize: 'initialize',
  listTools: 'listTools',
  callTool: 'callTool',
  other: 'other',
};

type MethodCategory = 'initialize' | 'listTools' | 'callTool' | 'other';

type LogsHistogramProps = {
  server?: string;
  method?: string;
  ok?: boolean;
  range?: { start: number; end: number } | undefined;
  onRangeChange?: (range: { start: number; end: number } | null) => void;
};

type ChartPoint = {
  value: [number, number];
  bucketStart: number;
  bucketEnd: number;
};

function categorizeMethod(method: string): MethodCategory {
  switch (method) {
    case 'initialize':
      return 'initialize';
    case 'listTools':
      return 'listTools';
    case 'callTool':
      return 'callTool';
    default:
      return 'other';
  }
}

function formatRange(start: number, end: number) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${format(startDate, 'MMM d, yyyy HH:mm:ss')} – ${format(endDate, 'HH:mm:ss')}`;
  }
  return `${format(startDate, 'MMM d, yyyy HH:mm:ss')} – ${format(endDate, 'MMM d, yyyy HH:mm:ss')}`;
}

export function LogsHistogram({ server, method, ok, range, onRangeChange }: LogsHistogramProps) {
  const [data, setData] = useState<LogsHistogramPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<InstanceType<typeof ReactECharts> | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeEmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRangeRef = useRef<{ start: number; end: number } | null>(null);
  const lastEmittedRangeRef = useRef<{ start: number; end: number } | null>(null);
  const suppressNextRangeRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const histogramParams: { server?: string; method?: string; ok?: boolean; maxBuckets: number } = {
        maxBuckets: 80,
      };
      if (server !== undefined) histogramParams.server = server;
      if (method !== undefined) histogramParams.method = method;
      if (ok !== undefined) histogramParams.ok = ok;
      const payload = await MCPService.LogsHistogram(histogramParams);
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [server, method, ok]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;
    const cleanupFns: Array<() => void> = [];

    const scheduleRefresh = () => {
      if (refreshTimeoutRef.current != null) return;
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        if (!cancelled) fetchData();
      }, 500);
    };

    on(EVENT_LOGS_RPC_EVENT, (evt) => {
      const log = evt.payload as any;
      if (server && log.server_name !== server) return;
      if (method && log.method !== method) return;
      if (ok !== undefined && log.ok !== ok) return;
      scheduleRefresh();
    })
      .then((unsub) => {
        if (cancelled) {
          safeUnlisten(unsub);
        } else {
          cleanupFns.push(unsub);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      while (cleanupFns.length) {
        const unsub = cleanupFns.pop();
        if (unsub) safeUnlisten(unsub);
      }
    };
  }, [server, method, ok, fetchData]);

  const { option, hasData, startTs, endTs } = useMemo(() => {
    if (!data || data.start_ts_ms == null || data.end_ts_ms == null || data.buckets.length === 0) {
      return { option: null, hasData: false, startTs: null, endTs: null };
    }

    const seriesOrder: MethodCategory[] = ['initialize', 'listTools', 'callTool', 'other'];
    const bucketPoints: Record<MethodCategory, ChartPoint[]> = {
      initialize: [],
      listTools: [],
      callTool: [],
      other: [],
    };

    for (const bucket of data.buckets) {
      const aggregated: Record<MethodCategory, number> = {
        initialize: 0,
        listTools: 0,
        callTool: 0,
        other: 0,
      };
      for (const count of bucket.counts) {
        const category = categorizeMethod(count.method);
        aggregated[category] += count.count;
      }
      for (const category of seriesOrder) {
        bucketPoints[category].push({
          value: [bucket.start_ts_ms, aggregated[category]],
          bucketStart: bucket.start_ts_ms,
          bucketEnd: bucket.end_ts_ms,
        });
      }
    }

    const option: EChartsOption = {
      animation: true,
      animationDuration: 220,
      animationDurationUpdate: 180,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      color: seriesOrder.map((key) => METHOD_COLORS[key]),
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          const first = params[0];
          if (!first) return '';
          const { bucketStart, bucketEnd } = first.data as ChartPoint;
          const header = formatRange(bucketStart, bucketEnd);
          const lines = params
            .filter((item: any) => item.data.value[1] > 0)
            .map((item: any) => {
              const name = item.seriesName;
              const value = item.data.value[1];
              return `<span style="display:inline-block;margin-right:6px;border-radius:50%;width:8px;height:8px;background:${item.color}"></span>${name}: ${value}`;
            });
          return [`<div style="margin-bottom:4px;">${header}</div>`, ...lines].join('<br/>');
        },
      },
      legend: {
        data: seriesOrder.map((key) => METHOD_LABELS[key]),
        top: 4,
        textStyle: { color: '#CBD5F5', fontSize: 11 },
        icon: 'rect',
        itemHeight: 6,
        itemWidth: 10,
      },
      grid: { left: 40, right: 12, top: 40, bottom: 60 },
      xAxis: {
        type: 'time',
        min: data.start_ts_ms,
        max: data.end_ts_ms,
        axisLabel: {
          color: '#94A3B8',
          formatter: (value: number) => format(new Date(value), 'MMM d HH:mm'),
        },
        axisLine: { lineStyle: { color: '#1E293B' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: '#94A3B8' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.15)' } },
      },
      dataZoom: [
        {
          type: 'inside',
          filterMode: 'weakFilter',
          zoomOnMouseWheel: 'shift',
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          filterMode: 'weakFilter',
          bottom: 16,
          height: 24,
          brushSelect: false,
        },
      ],
      series: seriesOrder.map((category) => ({
        name: METHOD_LABELS[category],
        type: 'bar',
        stack: 'total',
        barWidth: '60%',
        emphasis: { focus: 'series' },
        data: bucketPoints[category],
      })),
    };

    return { option, hasData: true, startTs: data.start_ts_ms, endTs: data.end_ts_ms };
  }, [data]);

  const scheduleRangeEmit = useCallback(
    (nextRange: { start: number; end: number } | null) => {
      if (!onRangeChange) return;
      if (rangeEmitTimeoutRef.current) {
        clearTimeout(rangeEmitTimeoutRef.current);
        rangeEmitTimeoutRef.current = null;
      }
      pendingRangeRef.current = nextRange;
      rangeEmitTimeoutRef.current = setTimeout(() => {
        rangeEmitTimeoutRef.current = null;
        const value = pendingRangeRef.current;
        pendingRangeRef.current = null;
        if (!onRangeChange) return;
        if (value) {
          const last = lastEmittedRangeRef.current;
          if (
            last &&
            Math.abs(last.start - value.start) < 1 &&
            Math.abs(last.end - value.end) < 1
          ) {
            return;
          }
          lastEmittedRangeRef.current = value;
          onRangeChange(value);
        } else {
          if (lastEmittedRangeRef.current === null) return;
          lastEmittedRangeRef.current = null;
          onRangeChange(null);
        }
      }, 200);
    },
    [onRangeChange],
  );

  const handleDataZoomEvent = useCallback(
    (event: any) => {
      if (!data || data.start_ts_ms == null || data.end_ts_ms == null) return;
      if (suppressNextRangeRef.current) {
        suppressNextRangeRef.current = false;
        return;
      }
      const payload = Array.isArray(event?.batch) && event.batch.length ? event.batch[0] : event;
      if (!payload) return;
      const domainStart = data.start_ts_ms;
      const domainEnd = data.end_ts_ms;
      const domainSpan = Math.max(domainEnd - domainStart, 1);
      const extractValue = (valueKey: 'startValue' | 'endValue', percentKey: 'start' | 'end') => {
        if (payload[valueKey] != null) return Number(payload[valueKey]);
        const percent = payload[percentKey];
        if (percent != null) {
          return domainStart + (Number(percent) / 100) * domainSpan;
        }
        return percentKey === 'start' ? domainStart : domainEnd;
      };
      let rawStart = extractValue('startValue', 'start');
      let rawEnd = extractValue('endValue', 'end');
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return;
      if (rawStart > rawEnd) {
        [rawStart, rawEnd] = [rawEnd, rawStart];
      }
      let clampedStart = Math.max(domainStart, rawStart);
      let clampedEnd = Math.min(domainEnd, rawEnd);
      if (clampedEnd <= clampedStart) {
        clampedEnd = Math.min(domainEnd, clampedStart + Math.max(data.bucket_width_ms, 1));
      }
      const almostEntire =
        Math.abs(clampedStart - domainStart) <= Math.max(data.bucket_width_ms, 1) &&
        Math.abs(clampedEnd - domainEnd) <= Math.max(data.bucket_width_ms, 1);
      scheduleRangeEmit(almostEntire ? null : { start: clampedStart, end: clampedEnd });
    },
    [data, scheduleRangeEmit],
  );

  useEffect(() => {
    lastEmittedRangeRef.current = range ?? null;
  }, [range]);

  useEffect(() => {
    const inst = chartRef.current?.getEchartsInstance?.();
    if (!inst || !data || data.start_ts_ms == null || data.end_ts_ms == null) return;
    if (range && range.end > range.start) {
      suppressNextRangeRef.current = true;
      inst.dispatchAction({ type: 'dataZoom', startValue: range.start, endValue: range.end });
    } else if (!range) {
      suppressNextRangeRef.current = true;
      inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    }
  }, [range, data]);

  const handleResetZoom = useCallback(() => {
    const inst = chartRef.current?.getEchartsInstance?.();
    if (!inst) return;
    suppressNextRangeRef.current = true;
    inst.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    scheduleRangeEmit(null);
  }, [scheduleRangeEmit]);

  useEffect(() => () => {
    if (rangeEmitTimeoutRef.current) {
      clearTimeout(rangeEmitTimeoutRef.current);
      rangeEmitTimeoutRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  return (
    <div className="mb-3">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-slate-900/70 p-3">
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Log Activity</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Stacked by RPC method; drag horizontally to zoom.</div>
          </div>
          <button
            type="button"
            onClick={handleResetZoom}
            className="self-start rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-100 dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
          >
            Reset view
          </button>
        </div>
        {loading && (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">Loading histogram…</div>
        )}
        {!loading && !hasData && (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">No log activity for the selected filters.</div>
        )}
        {!loading && hasData && option && (
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: 260 }}
            notMerge
            lazyUpdate
            onEvents={{ datazoom: handleDataZoomEvent }}
          />
        )}
        {!loading && hasData && startTs != null && endTs != null && (
          <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Showing activity from {format(new Date(startTs), 'MMM d, yyyy HH:mm:ss')} to {format(new Date(endTs), 'MMM d, yyyy HH:mm:ss')}.
          </div>
        )}
      </div>
    </div>
  );
}
