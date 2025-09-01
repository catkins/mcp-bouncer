import { describe, it, expect, vi } from 'vitest';
import { ToggleSwitch } from './ToggleSwitch';
import { render } from '../test/render';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
import userEvent from '@testing-library/user-event';

describe('ToggleSwitch', () => {
  it('calls onChange when toggled', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <ToggleSwitch checked={false} onChange={onChange} label="L" />,
    );
    await userEvent.click(getByRole('button', { name: 'L' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('disabled prevents change', async () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <ToggleSwitch checked={false} onChange={onChange} disabled label="L" />,
    );
    expect(getByRole('button', { name: 'L' })).toBeDisabled();
  });
});
