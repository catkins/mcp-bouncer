import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResponsePanel } from './ResponsePanel';
import type { CallOutcome } from './types';

function makeCallOutcome(overrides: Partial<CallOutcome> = {}): CallOutcome {
  return {
    timestamp: Date.now(),
    ok: false,
    durationMs: 12,
    result: {
      type: 'rpc_error',
      message: 'Required parameter `name` is missing',
      error: {
        code: -32602,
        message: 'Required parameter `name` is missing',
        data: {
          missing: ['name'],
        },
      },
    },
    request: {
      name: 'getTinyImage',
    },
    ...overrides,
  };
}

describe('ResponsePanel', () => {
  it('renders structured tool error messages returned from the debugger command', () => {
    const callResult = makeCallOutcome();

    render(<ResponsePanel callResult={callResult} callError={null} selectedToolName="getTinyImage" />);

    expect(screen.getByText('Required parameter `name` is missing')).toBeInTheDocument();
    expect(screen.getAllByText(/tool result/i).length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Tool result did not include any renderable content.'),
    ).not.toBeInTheDocument();
  });

  it('prefers callError fallback when no call result is present', () => {
    render(<ResponsePanel callResult={null} callError="HTTP 500" selectedToolName={null} />);

    expect(screen.getByText('HTTP 500')).toBeInTheDocument();
  });
});
