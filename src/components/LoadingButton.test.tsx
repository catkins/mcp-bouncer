import { describe, it, expect, vi } from 'vitest';
import { LoadingButton } from './LoadingButton';
import { render, screen } from '../test/render';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
import userEvent from '@testing-library/user-event';

describe('LoadingButton', () => {
  it('invokes onClick', async () => {
    const onClick = vi.fn();
    render(<LoadingButton onClick={onClick}>Go</LoadingButton>);
    await userEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(onClick).toHaveBeenCalled();
  });

  it('disabled prevents click', async () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <LoadingButton disabled onClick={onClick}>
        Go
      </LoadingButton>,
    );
    const btn = getByRole('button', { name: /go/i });
    expect(btn).toBeDisabled();
  });
});
