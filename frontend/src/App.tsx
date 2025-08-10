import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events";
import { MCPService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp";
import { Events } from "@wailsio/runtime";
import { ClipboardDocumentIcon, CheckIcon, SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline'

interface StatusIndicatorProps {
  isActive: boolean | null;
}

function StatusIndicator({ isActive }: StatusIndicatorProps) {
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

function App() {
  const [servers, setServers] = useState<string[]>([])
  const [listenAddr, setListenAddr] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [copySuccess, setCopySuccess] = useState<boolean>(false)

  const loadServers = async () => {
    try {
      const serverList = await MCPService.List()
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const loadListenAddr = async () => {
    try {
      const addr = await MCPService.ListenAddr()
      setListenAddr(addr)
    } catch (error) {
      console.error('Failed to load listen address:', error)
    }
  }

  const loadActive = async () => {
    try {
      const active = await MCPService.IsActive()
      setIsActive(active)
    } catch (error) {
      console.error('Failed to load active state:', error)
    }
  }

  const copyToClipboard = async () => {
    if (!listenAddr) return
    
    try {
      await navigator.clipboard.writeText(listenAddr)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }



  useEffect(() => {
    const init = async () => {
      await loadServers()
      await loadListenAddr()
      await loadActive()
    }

    init()

    // Listen for server updates
    const unsubscribe = Events.On("mcp:servers_updated", async (event: WailsEvent) => {
      await loadServers()
      await loadActive()
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <div className="h-screen bg-white p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3 mt-2">
        🤖 MCP Bouncer
        <StatusIndicator isActive={isActive} />
      </h1>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Listen Address</h2>
        <div className="flex items-center gap-2">
          <div 
            className="flex-1 bg-gray-100 px-3 py-2 rounded-md text-sm font-mono text-gray-800 cursor-pointer hover:bg-gray-200 transition-colors select-all"
            title="Click to select all"
          >
            <code>{listenAddr || 'Not available'}</code>
          </div>
          <button
            onClick={copyToClipboard}
            disabled={!listenAddr}
            className={`p-2 rounded-md text-sm font-medium transition-colors ${
              copySuccess 
                ? 'bg-green-500 text-white' 
                : listenAddr 
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
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Connected Servers</h2>
        <div className="space-y-2">
          {servers.length > 0 ? (
            servers.map((server, index) => (
              <div
                key={index}
                className="bg-blue-50 border border-blue-200 rounded-md p-3 text-gray-700"
              >
                {server}
              </div>
            ))
          ) : (
            <div className="text-gray-500 italic">No servers connected</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
