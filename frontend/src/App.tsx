import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events";
import { MCPService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp";
import { Events } from "@wailsio/runtime";

function App() {
  const [servers, setServers] = useState<string[]>([])
  const [listenAddr, setListenAddr] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean | null>(null)

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
        <span className="ml-2 inline-flex items-center gap-2">
          {(() => {
            const color = isActive === null ? 'bg-gray-300' : (isActive ? 'bg-green-500' : 'bg-red-400')
            const label = isActive === null ? 'Checking…' : (isActive ? 'Active' : 'Inactive')
            return (
              <>
                <span className={`h-2.5 w-2.5 rounded-full ${color}`}></span>
                <span className="text-sm text-gray-600">{label}</span>
              </>
            )
          })()}
        </span>
      </h1>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Listen Address</h2>
        <code className="bg-gray-100 px-3 py-2 rounded-md text-sm font-mono text-gray-800">
          {listenAddr || 'Not available'}
        </code>
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
