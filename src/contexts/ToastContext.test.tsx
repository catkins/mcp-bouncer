import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastContext';

function Harness() {
  const { toasts, addToast, removeToast } = useToast();
  return (
    <div>
      <button aria-label="Add" id="add" onClick={() => addToast({ type: 'info', title: 't' })} />
      <button aria-label="Remove" id="rm" onClick={() => toasts[0] && removeToast(toasts[0].id)} />
      <div id="count">{toasts.length}</div>
    </div>
  );
}

describe('ToastContext', () => {
  it('adds and removes toasts', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    const addBtn = screen.getByRole('button', { hidden: true, name: /add/i });
    await userEvent.click(addBtn);
    expect(screen.getByText('1')).toBeInTheDocument();
    // remove button (hidden name), second button in the order
    const rmBtn = screen.getByRole('button', { hidden: true, name: /remove/i });
    await userEvent.click(rmBtn);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
