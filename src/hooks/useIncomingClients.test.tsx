import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Mock the Tauri bridge
vi.mock('../tauri/bridge', async () => {
  const actual = await vi.importActual<Record<string, any>>('../tauri/bridge');
  let listeners: Record<string, (e: any) => void> = {};
  return {
    ...actual,
    MCPService: {
      ...actual.MCPService,
      GetIncomingClients: vi.fn(async () => []),
    },
    Events: {
      On: (event: string, handler: (e: { data: any }) => void) => {
        listeners[event] = handler;
        return () => delete listeners[event];
      },
      // helper for tests
      __emit: (event: string, data: any) => {
        listeners[event]?.({ data });
      },
    },
  };
});

import { useIncomingClients } from './useIncomingClients';
import { Events } from '../tauri/bridge';
import { EventsMap } from '../types/events';

function TestHarness({ onState }: { onState: (s: any) => void }) {
  const state = useIncomingClients();
  useEffect(() => {
    onState(state);
  }, [state]);
  return <div />;
}

describe('useIncomingClients', () => {
  let container: HTMLDivElement;
  let root: any;
  let latestState: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    latestState = undefined;
  });

  it('initially loads and updates on events', async () => {
    await act(async () => {
      root.render(<TestHarness onState={s => (latestState = s)} />);
    });

    // Initially empty
    expect(latestState.clients).toEqual([]);

    // Emit connect event
    await act(async () => {
      (Events as any).__emit(EventsMap.IncomingClientConnected, {
        id: 'c1',
        name: 'client',
        version: '1.0.0',
        title: 'Title',
        connected_at: { Time: '2025-01-01T00:00:00.000Z' },
      });
    });

    expect(latestState.clients[0]).toMatchObject({ id: 'c1', name: 'client' });

    // Emit disconnect event
    await act(async () => {
      (Events as any).__emit(EventsMap.IncomingClientDisconnected, { id: 'c1' });
    });

    expect(latestState.clients).toEqual([]);
  });
});
