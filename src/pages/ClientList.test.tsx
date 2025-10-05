import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { render, screen } from '../test/render';
import { ClientList } from './ClientList';

afterEach(() => cleanup());

describe('ClientList', () => {
  it('renders empty state', () => {
    render(<ClientList clients={[]} />);
    expect(screen.getByText(/No clients/i)).toBeInTheDocument();
  });

  it('renders provided clients', () => {
    render(
      <ClientList
        clients={[
          { id: '1', name: 'c1', version: '1.0.0', connected_at: null },
          { id: '2', name: 'c2', version: '2.0.0', connected_at: null },
        ]}
      />,
    );
    expect(screen.getByText('c1')).toBeInTheDocument();
    expect(screen.getByText('c2')).toBeInTheDocument();
  });
});
