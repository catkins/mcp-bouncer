import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatusIndicator } from './StatusIndicator';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(el);
  return { container, root };
}

describe('StatusIndicator', () => {
  it('renders checking state', () => {
    const { container } = render(<StatusIndicator isActive={null} />);
    expect(container.textContent).toContain('Checking');
  });
  it('renders active', () => {
    const { container } = render(<StatusIndicator isActive={true} />);
    expect(container.textContent).toContain('Active');
  });
  it('renders inactive', () => {
    const { container } = render(<StatusIndicator isActive={false} />);
    expect(container.textContent).toContain('Inactive');
  });
});

