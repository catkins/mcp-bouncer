import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/render';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { StatusIndicator } from './StatusIndicator';

afterEach(() => cleanup());

describe('StatusIndicator', () => {
  it('renders checking state', () => {
    render(<StatusIndicator isActive={null} />);
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });
  it('renders active', () => {
    render(<StatusIndicator isActive={true} />);
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });
  it('renders inactive', () => {
    render(<StatusIndicator isActive={false} />);
    expect(screen.getByText(/Inactive/i)).toBeInTheDocument();
  });
});
