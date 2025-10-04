import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/render';
import { DropdownSelect, type DropdownOption } from './DropdownSelect';

const basicOptions: DropdownOption[] = [
  { value: 'all', label: 'All' },
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two' },
];

describe('DropdownSelect', () => {
  it('renders label and options', () => {
    render(
      <DropdownSelect
        label="Status"
        value="all"
        onChange={() => {}}
        options={basicOptions}
      />,
    );

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
  });

  it('calls onChange when selecting an option', async () => {
    const handleChange = vi.fn();
    render(
      <DropdownSelect
        aria-label="Filter"
        value="all"
        onChange={event => handleChange(event.currentTarget.value)}
        options={basicOptions}
      />,
    );

    await userEvent.selectOptions(screen.getByLabelText('Filter'), 'two');
    expect(handleChange).toHaveBeenCalledWith('two');
  });

  it('disables interaction when disabled', async () => {
    const handleChange = vi.fn();
    render(
      <DropdownSelect
        aria-label="Disabled"
        value="all"
        onChange={handleChange}
        options={basicOptions}
        disabled
      />,
    );

    const combo = screen.getByLabelText('Disabled');
    expect(combo).toBeDisabled();
    await userEvent.selectOptions(combo, 'two');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('shows helper and error messages', () => {
    const { rerender } = render(
      <DropdownSelect
        label="Helper"
        value="all"
        onChange={() => {}}
        options={basicOptions}
        helperText="Choose wisely"
      />,
    );

    expect(screen.getByText('Choose wisely')).toBeInTheDocument();

    rerender(
      <DropdownSelect
        label="Helper"
        value="all"
        onChange={() => {}}
        options={basicOptions}
        error="This field is required"
      />,
    );

    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });
});
