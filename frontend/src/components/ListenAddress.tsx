import { useState } from 'react'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

interface ListenAddressProps {
  mcpUrl: string
  settings?: any // Made optional since we're not using it in the new structure
}

export function ListenAddress({ mcpUrl }: ListenAddressProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
        MCP Listen Address
      </h2>
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 font-mono">
          {mcpUrl || 'Loading...'}
        </div>
        <button
          onClick={handleCopy}
          disabled={!mcpUrl}
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="h-4 w-4 text-green-500" />
          ) : (
            <ClipboardDocumentIcon className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}
