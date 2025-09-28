import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle } from 'react';
import { LogsHistogram } from './LogsHistogram';
import { sqlLoggingService } from '../../lib/sqlLogging';
import * as events from '../../tauri/events';

type DataZoomHandler = ((event: any) => void) | undefined;

const dispatchActionMock = vi.fn();
let dataZoomHandler: DataZoomHandler;

vi.mock('echarts-for-react', () => {
  return {
    __esModule: true,
    default: forwardRef<any, any>((props, ref) => {
      dataZoomHandler = props.onEvents?.datazoom;
      useImperativeHandle(ref, () => ({
        getEchartsInstance: () => ({
          dispatchAction: dispatchActionMock,
        }),
      }));
      return <div data-testid="chart" />;
    }),
  };
});

const histogramPayload = {
  start_ts_ms: 1_000,
  end_ts_ms: 7_000,
  bucket_width_ms: 1_000,
  buckets: [
    {
      start_ts_ms: 1_000,
      end_ts_ms: 2_000,
      counts: [
        { method: 'initialize', count: 1 },
        { method: 'listTools', count: 2 },
      ],
    },
    {
      start_ts_ms: 2_000,
      end_ts_ms: 3_000,
      counts: [
        { method: 'callTool', count: 3 },
      ],
    },
    {
      start_ts_ms: 3_000,
      end_ts_ms: 4_000,
      counts: [
        { method: 'other', count: 1 },
      ],
    },
  ],
};

const logsHistogramSpy = vi.spyOn(sqlLoggingService as any, 'queryEventHistogram');
let onSpy: MockInstance;
let safeUnlistenSpy: MockInstance;

describe('LogsHistogram', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dataZoomHandler = undefined;
    dispatchActionMock.mockReset();
    logsHistogramSpy.mockResolvedValue(histogramPayload);
    onSpy = vi.spyOn(events as any, 'on').mockImplementation(async () => Promise.resolve(() => {}));
    safeUnlistenSpy = vi.spyOn(events as any, 'safeUnlisten').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    onSpy.mockRestore();
    safeUnlistenSpy.mockRestore();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.resetModules();
    logsHistogramSpy.mockRestore();
  });

  async function setup(
    onRangeChange?: (range: { start: number; end: number } | null) => void,
    range?: { start: number; end: number },
  ) {
    const props: Record<string, unknown> = {};
    if (onRangeChange) {
      props.onRangeChange = onRangeChange;
    }
    if (range) {
      props.range = range;
    }
    const utils = render(<LogsHistogram {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(logsHistogramSpy).toHaveBeenCalled();
    expect(typeof dataZoomHandler).toBe('function');
    dispatchActionMock.mockClear();
    return utils;
  }

  it('resets zoom and notifies parent when reset button is pressed for an active range', async () => {
    const rangeSpy = vi.fn();
    const { getByText } = await setup(rangeSpy, { start: 2_000, end: 4_000 });

    dispatchActionMock.mockClear();
    rangeSpy.mockClear();

    const button = getByText('Reset view');
    act(() => {
      fireEvent.click(button);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(dispatchActionMock).toHaveBeenCalledWith({ type: 'dataZoom', start: 0, end: 100 });
    expect(rangeSpy).toHaveBeenCalledWith(null);
  });

  it('applies external range updates without re-emitting', async () => {
    const rangeSpy = vi.fn();
    const { rerender } = await setup(rangeSpy);

    rangeSpy.mockClear();
    dispatchActionMock.mockClear();
    rerender(<LogsHistogram range={{ start: 2_500, end: 3_500 }} onRangeChange={rangeSpy} />);
    act(() => {
      vi.runAllTimers();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispatchActionMock).toHaveBeenCalledWith({ type: 'dataZoom', startValue: 2_500, endValue: 3_500 });
    expect(rangeSpy).not.toHaveBeenCalled();
  });
});
