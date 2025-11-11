import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/render';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';

const baseSettings = {
  listen_addr: 'http://127.0.0.1:8091/mcp',
  transport: 'tcp' as const,
  mcp_servers: [],
};

const addToastMock = vi.fn();

vi.mock('../../contexts/ToastContext', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../contexts/ToastContext');
  return {
    ...actual,
    useToast: () => ({ toasts: [], removeToast: vi.fn(), addToast: addToastMock }),
  };
});

beforeEach(() => {
  addToastMock.mockClear();
});

describe('SettingsModal', () => {
  it('submits transport changes and closes on success', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <SettingsModal
        isOpen
        settings={baseSettings}
        settingsPath="/tmp/settings.json"
        onSave={onSave}
        onClose={onClose}
        onOpenDirectory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText(/unix domain socket/i));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ ...baseSettings, transport: 'unix' });
    });
    expect(onClose).toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: 'Settings saved',
        message: expect.stringContaining('Unix socket'),
      }),
    );
  });

  it('disables listen address input when not in tcp mode and opens directory', async () => {
    const onOpenDirectory = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsModal
        isOpen
        settings={baseSettings}
        settingsPath={''}
        onSave={vi.fn()}
        onClose={() => {}}
        onOpenDirectory={onOpenDirectory}
      />,
    );

    const listenInput = screen.getByLabelText(/http listen address/i) as HTMLInputElement;
    expect(listenInput).not.toBeDisabled();
    await userEvent.click(screen.getByLabelText(/embedded stdio/i));
    expect(listenInput).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /open config directory/i }));
    expect(onOpenDirectory).toHaveBeenCalled();
  });

  it('shows validation error when tcp listen addr missing', async () => {
    const onSave = vi.fn();
    render(
      <SettingsModal
        isOpen
        settings={{ ...baseSettings, listen_addr: '' }}
        settingsPath="/tmp/settings.json"
        onSave={onSave}
        onClose={() => {}}
        onOpenDirectory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/listen address is required/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('does not show success toast when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('nope'));
    render(
      <SettingsModal
        isOpen
        settings={baseSettings}
        settingsPath="/tmp/settings.json"
        onSave={onSave}
        onClose={() => {}}
        onOpenDirectory={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/nope/i)).toBeInTheDocument();
    expect(addToastMock).not.toHaveBeenCalled();
  });
});
