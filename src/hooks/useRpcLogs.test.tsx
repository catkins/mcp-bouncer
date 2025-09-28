import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { RpcLog } from '../types/logs';
import { useRpcLogs } from './useRpcLogs';
import { sqlLoggingService } from '../lib/sqlLogging';
import * as events from '../tauri/events';

describe('useRpcLogs', () => {
  const baseLog: RpcLog = {
    id: '1',
    ts_ms: 200,
    session_id: 's',
    method: 'callTool',
    ok: true,
  };
  let eventListener: ((evt: { payload: RpcLog }) => void) | null = null;
  let logsListSpy: MockInstance;
  let onSpy: MockInstance;
  let safeUnlistenSpy: MockInstance;

beforeEach(() => {
  logsListSpy = vi.spyOn(sqlLoggingService as any, 'queryEvents');
  logsListSpy.mockResolvedValue([baseLog]);
  onSpy = vi.spyOn(events as any, 'on');
  onSpy.mockImplementation(async (_name: string, cb: (evt: { payload: RpcLog }) => void) => {
    eventListener = cb;
    return () => {};
  });
  safeUnlistenSpy = vi.spyOn(events as any, 'safeUnlisten');
  safeUnlistenSpy.mockImplementation(() => {});
  eventListener = null;
});

afterEach(() => {
  cleanup();
  logsListSpy.mockRestore();
  onSpy.mockRestore();
  safeUnlistenSpy.mockRestore();
  eventListener = null;
});

  it('passes time range parameters to LogsList and ignores live events outside range', async () => {
    const { result } = renderHook(() => useRpcLogs());

    await act(async () => {
      await result.current.reset({ range: { start: 100, end: 400 } });
    });

    expect(logsListSpy).toHaveBeenCalledTimes(1);
    const params = logsListSpy.mock.calls[0]?.[0] ?? {};
    expect(params.start_ts_ms).toBe(100);
    expect(params.end_ts_ms).toBe(400);
    expect(result.current.items).toHaveLength(1);

    const insideLog: RpcLog = { ...baseLog, id: 'inside', ts_ms: 250 };
    const outsideLog: RpcLog = { ...baseLog, id: 'outside', ts_ms: 50 };

    await act(async () => {
      eventListener?.({ payload: outsideLog });
    });
    expect(result.current.items.find((row) => row.id === 'outside')).toBeUndefined();

    await act(async () => {
      eventListener?.({ payload: insideLog });
    });
    expect(result.current.items[0]?.id).toBe('inside');

    logsListSpy.mockClear().mockResolvedValue([baseLog]);
    await act(async () => {
      await result.current.reset({ range: undefined });
    });
    expect(logsListSpy).toHaveBeenCalledWith({ limit: 50 });
  });
});
