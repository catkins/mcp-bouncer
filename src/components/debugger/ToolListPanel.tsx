import { LoadingButton } from '../LoadingButton';
import { MagnifyingGlassIcon, ArrowPathIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import type { Tool } from '../../tauri/bridge';

interface ToolListPanelProps {
  tools: Tool[];
  filteredTools: Tool[];
  selectedToolName: string | null;
  onSelectTool: (name: string | null) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  search: string;
  onSearchChange: (value: string) => void;
}

export function ToolListPanel({
  tools,
  filteredTools,
  selectedToolName,
  onSelectTool,
  loading,
  error,
  onRefresh,
  search,
  onSearchChange,
}: ToolListPanelProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-gray-200 bg-white/90 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <WrenchScrewdriverIcon className="h-4 w-4" />
          Tools
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({tools.length})</span>
        </div>
        <LoadingButton
          onClick={onRefresh}
          loading={loading}
          variant="secondary"
          size="sm"
          className="px-2 py-1 text-xs"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </LoadingButton>
      </div>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Filter tools"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-7 pr-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-red-500 dark:text-red-400">{error}</div>
        ) : filteredTools.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">No tools match your filter.</div>
        ) : (
          <ul className="flex flex-col">
            {filteredTools.map(tool => {
              const active = selectedToolName === tool.name;
              return (
                <li key={tool.name}>
                  <button
                    type="button"
                    onClick={() => onSelectTool(tool.name)}
                    className={`flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-800 ${
                      active
                        ? 'bg-blue-50/80 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <span className="text-sm font-medium">{tool.name}</span>
                    {tool.description ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{tool.description}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
