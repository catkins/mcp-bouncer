import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ClientList } from './ClientList';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(el));
  return { container, root };
}

describe('ClientList', () => {
  it('renders empty state', () => {
    const { container } = render(<ClientList clients={[]} />);
    expect(container.textContent).toContain('No clients');
  });

  it('renders provided clients', () => {
    const { container } = render(
      <ClientList
        clients={[
          { id: '1', name: 'c1', version: '1.0.0', connected_at: null },
          { id: '2', name: 'c2', version: '2.0.0', connected_at: null },
        ]}
      />,
    );
    expect(container.textContent).toContain('c1');
    expect(container.textContent).toContain('c2');
  });
});
