import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events";
import { MCPService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp";
import { Events } from "@wailsio/runtime";

function App() {
  const [servers, setServers] = useState<string[]>([])
  const [listenAddr, setListenAddr] = useState<string>('')

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

  useEffect(() => {
    const init = async () => {
      await loadServers()
      await loadListenAddr()
    }

    init()

    // Listen for server updates
    const unsubscribe = Events.On("mcp:servers_updated", async (event: WailsEvent) => {
      await loadServers()
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  return (
    <div className="container">
      <h1>🤖 MCP Bouncer</h1>
      <div>
        <code>{listenAddr}</code>
      </div>
      
      <div id="servers">
        {servers.map((server, index) => (
          <div key={index}>{server}</div>
        ))}
      </div>
    </div>
  )
}

export default App