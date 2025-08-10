import { useState, useEffect } from 'react'
import { WailsEvent } from "@wailsio/runtime/types/events";
import { MCPService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/mcp";
import { SettingsService } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings";
import { MCPServerConfig, Settings } from "../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models";
import { Events } from "@wailsio/runtime";
import { 
  ClipboardDocumentIcon, 
  CheckIcon, 
  SignalIcon, 
  SignalSlashIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'

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
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [listenAddr, setListenAddr] = useState<string>('')
  const [isActive, setIsActive] = useState<boolean | null>(null)
  const [copySuccess, setCopySuccess] = useState<boolean>(false)
  const [showAddServer, setShowAddServer] = useState<boolean>(false)
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null)

  const loadServers = async () => {
    try {
      const serverList = await MCPService.List()
      setServers(serverList)
    } catch (error) {
      console.error('Failed to load servers:', error)
    }
  }

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.GetSettings()
      setSettings(currentSettings)
      if (currentSettings) {
        setListenAddr(currentSettings.listen_addr)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
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
      await loadSettings()
      await loadServers()
      await loadActive()
    }

    init()

    // Listen for server updates
    const unsubscribe = Events.On("mcp:servers_updated", async (event: WailsEvent) => {
      await loadServers()
      await loadActive()
    })

    // Listen for settings updates
    const unsubscribeSettings = Events.On("settings:updated", async (event: WailsEvent) => {
      await loadSettings()
      await loadServers()
    })

    return () => {
      unsubscribe()
      unsubscribeSettings()
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
        {settings && (
          <div className="mt-2 text-sm text-gray-600">
            Auto-start: {settings.auto_start ? 'Enabled' : 'Disabled'}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">MCP Servers</h2>
          <button
            onClick={() => setShowAddServer(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
          >
            <PlusIcon className="h-4 w-4" />
            Add Server
          </button>
        </div>
        <div className="space-y-3">
          {servers.length > 0 ? (
            servers.map((server, index) => (
              <div
                key={server.name || index}
                className={`border rounded-md p-4 ${
                  server.enabled 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900">{server.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        server.enabled 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {server.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {server.description && (
                      <p className="text-sm text-gray-600 mb-2">{server.description}</p>
                    )}
                    <div className="text-sm text-gray-700">
                      <div><strong>Command:</strong> {server.command}</div>
                      {server.args && server.args.length > 0 && (
                        <div><strong>Args:</strong> {server.args.join(' ')}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => setEditingServer(server)}
                      className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                      title="Edit server"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        if (server.name) {
                          await MCPService.RemoveMCPServer(server.name)
                          await loadServers()
                        }
                      }}
                      className="p-1 text-red-500 hover:text-red-700 transition-colors"
                      title="Remove server"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-gray-500 italic text-center py-8">
              <Cog6ToothIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No MCP servers configured</p>
              <p className="text-sm">Click "Add Server" to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Server Modal */}
      {(showAddServer || editingServer) && (
        <ServerForm
          server={editingServer}
          onSave={async (serverConfig) => {
            if (editingServer && editingServer.name) {
              await MCPService.UpdateMCPServer(editingServer.name, serverConfig)
            } else {
              await MCPService.AddMCPServer(serverConfig)
            }
            await loadServers()
            setShowAddServer(false)
            setEditingServer(null)
          }}
          onCancel={() => {
            setShowAddServer(false)
            setEditingServer(null)
          }}
        />
      )}
    </div>
  )
}

// Server Form Component
interface ServerFormProps {
  server?: MCPServerConfig | null
  onSave: (server: MCPServerConfig) => void
  onCancel: () => void
}

function ServerForm({ server, onSave, onCancel }: ServerFormProps) {
  const [formData, setFormData] = useState<MCPServerConfig>({
    name: server?.name || '',
    description: server?.description || '',
    command: server?.command || '',
    args: server?.args || [],
    env: server?.env || {},
    enabled: server?.enabled ?? true
  })

  const [newArg, setNewArg] = useState('')
  const [newEnvKey, setNewEnvKey] = useState('')
  const [newEnvValue, setNewEnvValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  const addArg = () => {
    if (newArg.trim()) {
      setFormData(prev => ({
        ...prev,
        args: [...(prev.args || []), newArg.trim()]
      }))
      setNewArg('')
    }
  }

  const removeArg = (index: number) => {
    setFormData(prev => ({
      ...prev,
      args: prev.args?.filter((_, i) => i !== index) || []
    }))
  }

  const addEnvVar = () => {
    if (newEnvKey.trim() && newEnvValue.trim()) {
      setFormData(prev => ({
        ...prev,
        env: { ...(prev.env || {}), [newEnvKey.trim()]: newEnvValue.trim() }
      }))
      setNewEnvKey('')
      setNewEnvValue('')
    }
  }

  const removeEnvVar = (key: string) => {
    setFormData(prev => {
      const newEnv = { ...(prev.env || {}) }
      delete newEnv[key]
      return { ...prev, env: newEnv }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {server ? 'Edit MCP Server' : 'Add MCP Server'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., filesystem"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Filesystem MCP server for file operations"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Command *
              </label>
              <input
                type="text"
                required
                value={formData.command}
                onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., npx, python, node"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arguments
              </label>
              <div className="space-y-2">
                {formData.args?.map((arg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={arg}
                      onChange={(e) => {
                        const newArgs = [...(formData.args || [])]
                        newArgs[index] = e.target.value
                        setFormData(prev => ({ ...prev, args: newArgs }))
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeArg(index)}
                      className="px-2 py-2 text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newArg}
                    onChange={(e) => setNewArg(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArg())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add argument..."
                  />
                  <button
                    type="button"
                    onClick={addArg}
                    className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Environment Variables
              </label>
              <div className="space-y-2">
                {Object.entries(formData.env || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={key}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                    />
                    <input
                      type="text"
                      value={value}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(key)}
                      className="px-2 py-2 text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newEnvKey}
                    onChange={(e) => setNewEnvKey(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Variable name"
                  />
                  <input
                    type="text"
                    value={newEnvValue}
                    onChange={(e) => setNewEnvValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEnvVar())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Variable value"
                  />
                  <button
                    type="button"
                    onClick={addEnvVar}
                    className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900">
                Enable this server
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                {server ? 'Update Server' : 'Add Server'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default App
