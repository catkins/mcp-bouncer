import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events"
import { MCPService } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp"
import { SettingsService } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings"
import { MCPServerConfig, Settings } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models"
import { Events } from "@wailsio/runtime"

export function useMCPService() {
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [mcpUrl, setMcpUrl] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean | null>(null)

  const loadServers = async () => {
    try {
      const serverList = await MCPService.List()
      console.log('Loaded servers:', serverList)
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.GetSettings()
      setSettings(currentSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const loadMcpUrl = async () => {
    try {
      const url = await MCPService.ListenAddr()
      setMcpUrl(url)
    } catch (error) {
      console.error('Failed to load MCP URL:', error)
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

  const addServer = async (serverConfig: MCPServerConfig) => {
    await MCPService.AddMCPServer(serverConfig)
    await loadServers()
  }

  const updateServer = async (serverName: string, serverConfig: MCPServerConfig) => {
    await MCPService.UpdateMCPServer(serverName, serverConfig)
    await loadServers()
  }

  const removeServer = async (serverName: string) => {
    await MCPService.RemoveMCPServer(serverName)
    await loadServers()
  }

  useEffect(() => {
    const init = async () => {
      await loadSettings()
      await loadMcpUrl()
      await loadServers()
      await loadActive()
    }

    init()

    // Listen for server updates
    const unsubscribe = Events.On("mcp:servers_updated", async (event: WailsEvent) => {
      console.log('Received mcp:servers_updated event:', event)
      await loadServers()
      await loadActive()
    })

    // Listen for settings updates
    const unsubscribeSettings = Events.On("settings:updated", async (event: WailsEvent) => {
      console.log('Received settings:updated event:', event)
      await loadSettings()
      await loadMcpUrl()
      await loadServers()
    })

    return () => {
      unsubscribe()
      unsubscribeSettings()
    }
  }, [])

  return {
    servers,
    settings,
    mcpUrl,
    isActive,
    addServer,
    updateServer,
    removeServer,
    loadServers,
    loadSettings,
    loadMcpUrl,
    loadActive
  }
}
