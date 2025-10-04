import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Tool } from '../../tauri/bridge';
import { ToolListPanel } from './ToolListPanel';

const tools: Tool[] = [
  { name: 'server::alpha', description: 'Alpha tool' },
  { name: 'server::beta', description: 'Beta tool' },
  { name: 'server::gamma', description: 'Gamma helper' },
];

describe('ToolListPanel', () => {
  it('renders tools and highlights the selected one', () => {
    render(
      <ToolListPanel
        tools={tools}
        filteredTools={tools}
        selectedToolName="server::beta"
        onSelectTool={() => {}}
        loading={false}
        error={null}
        onRefresh={() => {}}
        search=""
        onSearchChange={() => {}}
      />,
    );

    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('server::alpha')).toBeInTheDocument();
    const selected = screen.getByText('server::beta');
    expect(selected.closest('button')).toHaveClass('bg-blue-50/80');
  });

  it('filters tools based on search input', async () => {
    const handleSearch = vi.fn();
    render(
      <ToolListPanel
        tools={tools}
        filteredTools={tools.filter(tool => tool.name === 'server::gamma')}
        selectedToolName={null}
        onSelectTool={() => {}}
        loading={false}
        error={null}
        onRefresh={() => {}}
        search=""
        onSearchChange={handleSearch}
      />,
    );

    const [searchBox] = screen.getAllByPlaceholderText('Filter tools');
    expect(searchBox).toBeDefined();
    fireEvent.change(searchBox!, { target: { value: 'gamma' } });
    await waitFor(() => expect(handleSearch).toHaveBeenCalledWith('gamma'));
    expect(screen.getByText('server::gamma')).toBeInTheDocument();
  });

  it('triggers refresh handler when clicking refresh button', () => {
    const handleRefresh = vi.fn();
    render(
      <ToolListPanel
        tools={tools}
        filteredTools={tools}
        selectedToolName={null}
        onSelectTool={() => {}}
        loading={false}
        error={null}
        onRefresh={handleRefresh}
        search=""
        onSearchChange={() => {}}
      />,
    );

    const [refreshButton] = screen.getAllByRole('button', { name: /Refresh/i });
    expect(refreshButton).toBeDefined();
    fireEvent.click(refreshButton!);
    expect(handleRefresh).toHaveBeenCalled();
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
