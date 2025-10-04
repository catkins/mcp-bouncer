import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResponsePanel } from './ResponsePanel';
import type { CallOutcome } from './types';
import { fireEvent } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
const baseOutcome: CallOutcome = {
  timestamp: Date.now(),
  ok: true,
  durationMs: 120,
  result: { content: [{ type: 'text', text: 'result' }] },
  request: { input: 'value' },
};

describe('ResponsePanel', () => {
  it('renders success state when call succeeded', () => {
    render(<ResponsePanel callResult={baseOutcome} callError={null} selectedToolName="server::alpha" />);

    expect(screen.getByText(/ok · 120 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/Tool Result/)).toHaveTextContent('(server::alpha)');
  });

  it('renders backend error message when call failed', () => {
    const failedOutcome: CallOutcome = {
      ...baseOutcome,
      ok: false,
      durationMs: 45,
      result: {
        is_error: true,
        content: [{ type: 'text', text: 'tool exploded' }],
      },
    };

    render(<ResponsePanel callResult={failedOutcome} callError={null} selectedToolName="server::alpha" />);

    expect(screen.getByText(/error · 45 ms/i)).toBeInTheDocument();
    expect(screen.getAllByText('tool exploded')[0]).toBeInTheDocument();
  });

  it('shows fallback message when error structure is nested', () => {
    const failedOutcome: CallOutcome = {
      ...baseOutcome,
      ok: false,
      durationMs: 30,
      result: {
        error: { message: 'remote server rejected the request' },
      },
    };

    render(<ResponsePanel callResult={failedOutcome} callError={null} selectedToolName="server::alpha" />);

    expect(screen.getAllByText(/remote server rejected/i)[0]).toBeInTheDocument();
  });

  it('toggles between rich and raw result views', () => {
    render(<ResponsePanel callResult={baseOutcome} callError={null} selectedToolName="server::alpha" />);

    expect(screen.getByText('result')).toBeInTheDocument();
    const viewModeLabel = screen.getByText(/View Mode/i);
    const toggleButton = viewModeLabel.parentElement?.querySelector('button');
    expect(toggleButton).toBeTruthy();
    fireEvent.click(toggleButton!);
    expect(screen.getByText(/raw json/i)).toBeInTheDocument();
  });

  it('shows network error message when present', () => {
    render(<ResponsePanel callResult={null} callError="Network error" selectedToolName={null} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});
