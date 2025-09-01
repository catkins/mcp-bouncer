import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { TabSwitcher } from './TabSwitcher';

describe('TabSwitcher', () => {
  it('renders counts and switches', async () => {
    const onChange = vi.fn();
    render(
      <TabSwitcher value="servers" onChange={onChange} serverCount={2} clientCount={3} />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    const clientsBtn = screen.getByRole('button', { name: /Clients/i });
    await userEvent.click(clientsBtn);
    expect(onChange).toHaveBeenCalledWith('clients');
  });
});
