import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { vi } from 'vitest';
import { LogsPage } from './LogsPage';
import { ToastProvider } from '../contexts/ToastContext';
import { sqlLoggingService } from '../lib/sqlLogging';
import { useRpcLogs } from '../hooks/useRpcLogs';

vi.mock('../components/logs/LogList', () => ({
  LogList: () => <div data-testid="log-list" />,
}));
vi.mock('../components/logs/LogsHistogram', () => ({
  LogsHistogram: () => <div data-testid="logs-histogram" />,
}));
vi.mock('../components/logs/LogsFilterBar', () => ({
  LogsFilterBar: () => <div data-testid="logs-filter-bar" />,
}));

vi.mock('../hooks/useRpcLogs');
const mockedUseRpcLogs = vi.mocked(useRpcLogs);

function renderWithToast(children: ReactNode) {
  return render(<ToastProvider>{children}</ToastProvider>);
}

describe('LogsPage clear logs button', () => {
  const resetMock = vi.fn();
  const loadMoreMock = vi.fn();
  const baseHookValue = {
    items: [] as any[],
    loading: false,
    hasMore: false,
    server: undefined,
    method: undefined,
    okFlag: undefined,
    timeRange: undefined,
    setServer: vi.fn(),
    setMethod: vi.fn(),
    setOkFlag: vi.fn(),
    reset: resetMock,
    loadMore: loadMoreMock,
  } as const;

  beforeEach(() => {
    resetMock.mockReset().mockResolvedValue(undefined);
    loadMoreMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(sqlLoggingService, 'countEvents').mockResolvedValue(5);
    vi.spyOn(sqlLoggingService, 'clearEvents').mockResolvedValue();
    mockedUseRpcLogs.mockReturnValue({ ...baseHookValue });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears logs immediately when clicked', async () => {
    const user = userEvent.setup();
    const onCleared = vi.fn();

    renderWithToast(<LogsPage onLogsCleared={onCleared} />);

    const button = await screen.findByRole('button', { name: /clear logs/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    await user.click(button);

    await waitFor(() => {
      expect(sqlLoggingService.clearEvents).toHaveBeenCalledTimes(1);
      expect(resetMock).toHaveBeenCalledTimes(1);
      expect(onCleared).toHaveBeenCalledTimes(1);
    });
  });

  it('disables action when no rows exist', async () => {
    vi.spyOn(sqlLoggingService, 'countEvents').mockResolvedValue(0);
    const user = userEvent.setup();

    renderWithToast(<LogsPage />);

    const button = await screen.findByRole('button', { name: /clear logs/i });
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    expect(sqlLoggingService.clearEvents).not.toHaveBeenCalled();
  });
});
