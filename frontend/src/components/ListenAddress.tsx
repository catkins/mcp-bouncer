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
      <h2 className="text-lg font-semibold text-gray-700 mb-2">Listen Address</h2>
      <div className="flex items-center gap-2">
        <div 
          className="flex-1 bg-gray-100 px-3 py-2 rounded-md text-sm font-mono text-gray-800 cursor-pointer hover:bg-gray-200 transition-colors select-all"
          title="Click to select all"
        >
          <code>{mcpUrl || 'Not available'}</code>
        </div>
        <button
          onClick={copyToClipboard}
          disabled={!mcpUrl}
          className={`p-2 rounded-md text-sm font-medium transition-colors ${
            copySuccess 
              ? 'bg-green-500 text-white' 
              : mcpUrl 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          title={copySuccess ? 'Copied!' : 'Copy to clipboard'}
        >
          {copySuccess ? (
            <CheckIcon className="h-5 w-5" />
          ) : (
            <ClipboardDocumentIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {settings && (
        <div className="mt-2 text-sm text-gray-600">
          Auto-start: {settings.auto_start ? 'Enabled' : 'Disabled'}
        </div>
      )}
    </div>
  )
}
