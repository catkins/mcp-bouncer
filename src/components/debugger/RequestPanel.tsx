import { DocumentTextIcon } from '@heroicons/react/24/outline';
import type { Tool } from '../../tauri/bridge';
import { ToolRequestForm } from './ToolRequestForm';

interface RequestPanelProps {
  tool: Tool | null;
  disabled: boolean;
  loading: boolean;
  onSubmit: (payload?: Record<string, unknown>) => Promise<void>;
}

export function RequestPanel({ tool, disabled, loading, onSubmit }: RequestPanelProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-surface-200 bg-surface-50/90 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900/60">
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-surface-800 dark:text-gray-100">Request</h3>
        </div>
        {tool?.description ? (
          <p className="text-xs text-surface-600 dark:text-surface-300">{tool.description}</p>
        ) : null}
      </div>
      {!tool ? (
        <div className="flex flex-1 items-center justify-center text-sm text-surface-500 dark:text-surface-400">
          Select a tool to configure the request arguments.
        </div>
      ) : (
        <ToolRequestForm tool={tool} disabled={disabled} loading={loading} onSubmit={onSubmit} />
      )}
    </div>
  );
}
