interface StatusIndicatorProps {
  isActive: boolean | null;
}

export function StatusIndicator({ isActive }: StatusIndicatorProps) {
  if (isActive === null) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700">
        <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-400"></div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Checking…</span>
      </div>
    )
  } else if (isActive) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 dark:bg-green-900/30 rounded-full border border-green-200 dark:border-green-800">
        <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse"></div>
        <span className="text-xs font-medium text-green-700 dark:text-green-400">Active</span>
      </div>
    )
  } else {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/30 rounded-full border border-red-200 dark:border-red-800">
        <div className="h-1.5 w-1.5 bg-red-500 rounded-full"></div>
        <span className="text-xs font-medium text-red-700 dark:text-red-400">Inactive</span>
      </div>
    )
  }
}
