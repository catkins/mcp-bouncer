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
        socketBridgePath={null}
        onOpenConfig={onOpenConfig}
        theme="light"
        toggleTheme={toggleTheme}
      />,
    );
    expect(screen.getByText(/127\.0\.0\.1/)).toBeInTheDocument();
    const configBtn = screen.getByRole('button', { name: /open config directory/i });
    await userEvent.click(configBtn);
    expect(onOpenConfig).toHaveBeenCalled();
    expect(configBtn).toHaveAttribute('title', 'Open config directory');
    const themeBtn = screen.getByRole('button', { name: /toggle theme/i });
    expect(themeBtn).toHaveAttribute('title', 'Switch to dark mode');
  });

  it('renders bridge info when provided', async () => {
    const onOpenConfig = vi.fn();
    const toggleTheme = vi.fn();
    render(
      <Header
        isActive={true}
        mcpUrl="stdio"
        socketBridgePath={{ path: '/tmp/proxy', exists: false }}
        onOpenConfig={onOpenConfig}
        theme="light"
        toggleTheme={toggleTheme}
      />,
    );
    const pathEl = screen.getByText('/tmp/proxy');
    expect(pathEl).toHaveAttribute('title', '/tmp/proxy');
    expect(pathEl).toHaveAttribute(
      'aria-description',
      'Path to the Unix stdio bridge helper binary',
    );
    expect(screen.queryByText('stdio')).not.toBeInTheDocument();
    const copyBtn = screen.getByRole('button', { name: /copy bridge path/i });
    expect(copyBtn).toBeDisabled();
    expect(copyBtn).toHaveAttribute('title', 'Copy path to stdio bridge');
    expect(screen.getByText(/build helper/i)).toBeInTheDocument();
  });
});
