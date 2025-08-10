import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events"
import { MCPService } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp"
import { SettingsService } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings"
import { MCPServerConfig, Settings } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models"
import { ClientStatus } from "../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp/models"
import { Events } from "@wailsio/runtime"

export function useMCPService() {
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [mcpUrl, setMcpUrl] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [clientStatus, setClientStatus] = useState<{ [key: string]: ClientStatus }>({})
  const [loadingStates, setLoadingStates] = useState<{
    addServer: boolean
    updateServer: boolean
    removeServer: boolean
    general: boolean
  }>({
    addServer: false,
    updateServer: false,
    removeServer: false,
    general: false
  })
  const [errors, setErrors] = useState<{
    addServer?: string
    updateServer?: string
    removeServer?: string
    general?: string
  }>({})

  const setLoading = (key: keyof typeof loadingStates, value: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: value }))
  }

  const setError = (key: keyof typeof errors, error?: string) => {
    setErrors(prev => ({ ...prev, [key]: error }))
  }

  const loadServers = async () => {
    try {
      setLoading('general', true)
      const serverList = await MCPService.List()
      console.log('Loaded servers:', serverList)
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
      setError('general', 'Failed to load servers')
    } finally {
      setLoading('general', false)
    }
  }

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.GetSettings()
      setSettings(currentSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
      setError('general', 'Failed to load settings')
    }
  }

  const loadMcpUrl = async () => {
    try {
      const url = await MCPService.ListenAddr()
      setMcpUrl(url)
    } catch (error) {
      console.error('Failed to load MCP URL:', error)
      setError('general', 'Failed to load MCP URL')
    }
  }

  const loadActive = async () => {
    try {
      const active = await MCPService.IsActive()
      setIsActive(active)
    } catch (error) {
      console.error('Failed to load active state:', error)
      setError('general', 'Failed to load service status')
    }
  }

  const loadClientStatus = async () => {
    try {
      const status = await MCPService.GetClientStatus()
      setClientStatus(status)
    } catch (error) {
      console.error('Failed to load client status:', error)
      setError('general', 'Failed to load client status')
    }
  }

  const addServer = async (serverConfig: MCPServerConfig) => {
    try {
      setLoading('addServer', true)
      setError('addServer')
      await MCPService.AddMCPServer(serverConfig)
      await loadServers()
    } catch (error) {
      console.error('Failed to add server:', error)
      setError('addServer', 'Failed to add server')
      throw error
    } finally {
      setLoading('addServer', false)
    }
  }

  const updateServer = async (serverName: string, serverConfig: MCPServerConfig) => {
    try {
      setLoading('updateServer', true)
      setError('updateServer')
      await MCPService.UpdateMCPServer(serverName, serverConfig)
      await loadServers()
    } catch (error) {
      console.error('Failed to update server:', error)
      setError('updateServer', 'Failed to update server')
      throw error
    } finally {
      setLoading('updateServer', false)
    }
  }

  const removeServer = async (serverName: string) => {
    try {
      setLoading('removeServer', true)
      setError('removeServer')
      await MCPService.RemoveMCPServer(serverName)
      await loadServers()
    } catch (error) {
      console.error('Failed to remove server:', error)
      setError('removeServer', 'Failed to remove server')
      throw error
    } finally {
      setLoading('removeServer', false)
    }
  }

  const openConfigDirectory = async () => {
    try {
      await SettingsService.OpenConfigDirectory()
    } catch (error) {
      console.error('Failed to open config directory:', error)
      setError('general', 'Failed to open config directory')
    }
  }

  useEffect(() => {
    const init = async () => {
      await loadSettings()
      await loadMcpUrl()
      await loadServers()
      await loadActive()
      await loadClientStatus()
    }

    init()

    // Listen for server updates
    const unsubscribe = Events.On("mcp:servers_updated", async (event: WailsEvent) => {
      console.log('Received mcp:servers_updated event:', event)
      await loadServers()
      await loadActive()
      await loadClientStatus()
    })

    // Listen for settings updates
    const unsubscribeSettings = Events.On("settings:updated", async (event: WailsEvent) => {
      console.log('Received settings:updated event:', event)
      await loadSettings()
      await loadMcpUrl()
      await loadServers()
      await loadClientStatus()
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
    loadingStates,
    errors,
    addServer,
    updateServer,
    removeServer,
    openConfigDirectory,
    loadServers,
    loadSettings,
    loadMcpUrl,
    loadActive,
    loadClientStatus,
    clientStatus
  }
}
