import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '../test/render';
import { Toast, ToastContainer } from './Toast';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses after duration', async () => {
    const onClose = vi.fn();
    render(
      <Toast id="t1" type="info" title="Hello" message="World" duration={100} onClose={onClose} />,
    );
    // advance timers for duration + fade-out
    vi.advanceTimersByTime(500);
    expect(onClose).toHaveBeenCalledWith('t1');
  });

  it('close button triggers onClose', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <Toast id="t2" type="success" title="Hi" message="There" duration={5000} onClose={onClose} />,
    );
    const closeBtn = container.querySelector('button') as HTMLButtonElement;
    closeBtn?.click();
    vi.advanceTimersByTime(400);
    expect(onClose).toHaveBeenCalledWith('t2');
  });
});

describe('ToastContainer', () => {
  it('renders multiple toasts', () => {
    const onClose = vi.fn();
    render(
      <ToastContainer
        toasts={[
          { id: 'a', type: 'success', title: 'A' },
          { id: 'b', type: 'error', title: 'B' },
        ]}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
