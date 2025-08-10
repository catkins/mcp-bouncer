import { useState } from 'react'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'
import { Settings } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'

interface ListenAddressProps {
  mcpUrl: string
  settings: Settings | null
}

export function ListenAddress({ mcpUrl, settings }: ListenAddressProps) {
  const [copySuccess, setCopySuccess] = useState<boolean>(false)

  const copyToClipboard = async () => {
    if (!mcpUrl) return
    
    try {
      await navigator.clipboard.writeText(mcpUrl)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Listen Address</h2>
      <div className="flex items-center gap-2">
        <div 
          className="flex-1 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-all"
          title="Click to select all"
        >
          <code>{mcpUrl || 'Not available'}</code>
        </div>
        <button
          onClick={copyToClipboard}
          disabled={!mcpUrl}
          className={`p-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            copySuccess 
              ? 'bg-green-500 text-white shadow-lg scale-105' 
              : mcpUrl 
                ? 'bg-blue-500 text-white hover:bg-blue-600 hover:shadow-md active:scale-95' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
          title={copySuccess ? 'Copied!' : 'Copy to clipboard'}
        >
          {copySuccess ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            <ClipboardDocumentIcon className="h-4 w-4" />
          )}
        </button>
      </div>
      {settings && (
        <div className="mt-2 flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${settings.auto_start ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'}`}></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Auto-start: {settings.auto_start ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      )}
    </div>
  )
}
