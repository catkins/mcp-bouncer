import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';

describe('Header', () => {
  it('shows MCP URL and calls handlers', async () => {
    const onOpenConfig = vi.fn();
    const toggleTheme = vi.fn();
    render(
      <Header
        isActive={true}
        mcpUrl="http://127.0.0.1:8091/mcp"
        onOpenConfig={onOpenConfig}
        theme="light"
        toggleTheme={toggleTheme}
      />,
    );
    expect(screen.getByText(/127\.0\.0\.1/)).toBeInTheDocument();
    const configBtn = screen.getByRole('button', { name: /open config directory/i });
    await userEvent.click(configBtn);
    expect(onOpenConfig).toHaveBeenCalled();
  });
});
