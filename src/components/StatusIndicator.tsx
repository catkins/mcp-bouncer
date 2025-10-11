interface StatusIndicatorProps {
  isActive: boolean | null;
}

export function StatusIndicator({ isActive }: StatusIndicatorProps) {
  if (isActive === null) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-100 px-2 py-1 dark:border-surface-700 dark:bg-surface-800">
        <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-surface-300 border-t-surface-600 dark:border-surface-600 dark:border-t-surface-400"></div>
        <span className="text-xs font-medium text-surface-600 dark:text-surface-300">Checking…</span>
      </div>
    );
  } else if (isActive) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-50 dark:bg-brand-900/30 rounded-full border border-brand-200 dark:border-brand-800">
        <div className="h-1.5 w-1.5 bg-brand-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium text-brand-700 dark:text-brand-300">Active</span>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded-full border border-red-200 dark:border-red-800">
        <div className="h-1.5 w-1.5 bg-red-500 rounded-full"></div>
        <span className="text-xs font-medium text-red-700 dark:text-red-400">Inactive</span>
      </div>
    );
  }
}
