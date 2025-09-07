import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { KeyValueList } from './KeyValueList';

describe('KeyValueList', () => {
  it('renders items and calls callbacks', async () => {
    const onAdd = vi.fn();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();

    render(
      <KeyValueList
        label="Headers"
        items={{ Accept: 'application/json', Authorization: 'Bearer token' }}
        keyPlaceholder="Header"
        valuePlaceholder="Value"
        onAdd={onAdd}
        onUpdate={onUpdate}
        onRemove={onRemove}
        ariaLabelBase="HTTP header"
      />,
    );

    expect(screen.getByText('Headers')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Accept')).toBeInTheDocument();
    expect(screen.getByDisplayValue('application/json')).toBeInTheDocument();

    // Add button
    await userEvent.click(screen.getByRole('button', { name: /add headers/i }));
    expect(onAdd).toHaveBeenCalled();

    // Update key (index-aware)
    const keyInput = screen.getByLabelText('HTTP header key 1') as HTMLInputElement;
    keyInput.focus();
    await userEvent.type(keyInput, '-X');
    expect(onUpdate).toHaveBeenCalled();
    // Ensure focus did not get lost while typing
    expect(document.activeElement).toBe(keyInput);

    // Update value
    const valInput = screen.getByLabelText('HTTP header value 1') as HTMLInputElement;
    await userEvent.clear(valInput);
    await userEvent.type(valInput, 'text/plain');
    expect(onUpdate).toHaveBeenCalled();

    // Remove button for first row
    const removeButtons = screen.getAllByRole('button', { name: /remove http header/i });
    await userEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalled();
  });
});
