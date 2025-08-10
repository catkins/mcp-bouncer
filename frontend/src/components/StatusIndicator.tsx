import { SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline'

interface StatusIndicatorProps {
  isActive: boolean | null;
}

export function StatusIndicator({ isActive }: StatusIndicatorProps) {
  if (isActive === null) {
    return (
      <span className="ml-2 inline-flex items-center gap-2">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
        <span className="text-sm text-gray-600">Checking…</span>
      </span>
    )
  } else if (isActive) {
    return (
      <span className="ml-2 inline-flex items-center gap-2">
        <SignalIcon className="h-5 w-5 text-green-500" />
        <span className="text-sm text-gray-600">Active</span>
      </span>
    )
  } else {
    return (
      <span className="ml-2 inline-flex items-center gap-2">
        <SignalSlashIcon className="h-5 w-5 text-red-500" />
        <span className="text-sm text-gray-600">Inactive</span>
      </span>
    )
  }
}
