import { useState, useEffect } from 'react'
import { XMarkIcon, WrenchScrewdriverIcon, PowerIcon } from '@heroicons/react/24/outline'
import { MCPService } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp'
import { ToggleSwitch } from './ToggleSwitch'
import { LoadingButton } from './LoadingButton'

interface Tool {
  name: string
  description: string
  inputSchema?: any
}

interface ToolsModalProps {
  serverName: string
  isOpen: boolean
  onClose: () => void
}

export function ToolsModal({ serverName, isOpen, onClose }: ToolsModalProps) {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [toolStates, setToolStates] = useState<{ [key: string]: boolean }>({})
  const [toggleLoading, setToggleLoading] = useState<{ [key: string]: boolean }>({})
  const [bulkLoading, setBulkLoading] = useState(false)

  useEffect(() => {
    if (isOpen && serverName) {
      loadTools()
    }
  }, [isOpen, serverName])

  const loadTools = async () => {
    try {
      setLoading(true)
      setError('')
      const toolsData = await MCPService.GetClientTools(serverName)
      setTools(toolsData as Tool[])
      
      // Initialize all tools as enabled by default
      const initialStates: { [key: string]: boolean } = {}
      toolsData.forEach((tool: any) => {
        initialStates[tool.name] = true
      })
      setToolStates(initialStates)
    } catch (err) {
      console.error('Failed to load tools:', err)
      setError(err instanceof Error ? err.message : 'Failed to load tools')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleTool = async (toolName: string, enabled: boolean) => {
    try {
      setToggleLoading(prev => ({ ...prev, [toolName]: true }))
      await MCPService.ToggleTool(serverName, toolName, enabled)
      setToolStates(prev => ({ ...prev, [toolName]: enabled }))
    } catch (err) {
      console.error('Failed to toggle tool:', err)
      // Revert the toggle state on error
      setToolStates(prev => ({ ...prev, [toolName]: !enabled }))
      setError(err instanceof Error ? err.message : 'Failed to toggle tool')
    } finally {
      setToggleLoading(prev => ({ ...prev, [toolName]: false }))
    }
  }

  const handleBulkToggle = async () => {
    const enabledCount = Object.values(toolStates).filter(Boolean).length
    const totalCount = tools.length
    const shouldEnable = enabledCount < totalCount / 2 // Enable if less than half are enabled
    
    try {
      setBulkLoading(true)
      setError('')
      
      // Toggle all tools to the target state
      const promises = tools.map(tool => 
        MCPService.ToggleTool(serverName, tool.name, shouldEnable)
      )
      
      await Promise.all(promises)
      
      // Update all tool states
      const newStates: { [key: string]: boolean } = {}
      tools.forEach(tool => {
        newStates[tool.name] = shouldEnable
      })
      setToolStates(newStates)
      
    } catch (err) {
      console.error('Failed to bulk toggle tools:', err)
      setError(err instanceof Error ? err.message : 'Failed to bulk toggle tools')
    } finally {
      setBulkLoading(false)
    }
  }

  // Calculate bulk action state
  const enabledCount = Object.values(toolStates).filter(Boolean).length
  const totalCount = tools.length
  const shouldEnable = enabledCount < totalCount / 2
  const bulkActionText = shouldEnable ? 'Enable All' : 'Disable All'
  const bulkActionDescription = shouldEnable 
    ? `Enable all ${totalCount} tools` 
    : `Disable all ${totalCount} tools`

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('keydown', handleEscape)
      }
    }
    
    return undefined
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Tools - {serverName}
            </h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({tools.length} tools)
            </span>
          </div>
          <LoadingButton
            onClick={onClose}
            variant="secondary"
            size="sm"
            className="p-1.5"
          >
            <XMarkIcon className="h-4 w-4" />
          </LoadingButton>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-8">
              <WrenchScrewdriverIcon className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No tools available for this server</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Toggle individual tools on or off. Disabled tools will not be available to MCP clients.
                </p>
                
                {/* Bulk Action Button */}
                <button
                  onClick={handleBulkToggle}
                  disabled={bulkLoading}
                  className={`inline-flex flex-row items-center justify-start gap-1.5 text-xs whitespace-nowrap px-3 py-1.5 font-medium rounded-md shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm transition-all duration-150 ${
                    shouldEnable 
                      ? 'bg-green-100 hover:bg-green-200 text-green-800 border border-green-300 hover:border-green-400' 
                      : 'bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300 hover:border-orange-400'
                  }`}
                >
                  {bulkLoading ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  ) : (
                    <PowerIcon className="w-3 h-3" />
                  )}
                  <span>{bulkActionText}</span>
                </button>
              </div>
              
              {/* Table */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tool
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                    {tools.map((tool, index) => (
                      <tr 
                        key={tool.name}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors duration-150 ${
                          toggleLoading[tool.name] ? 'opacity-75' : ''
                        }`}
                      >
                        <td className="px-3 py-2">
                          <code className="text-sm font-mono text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {tool.name}
                          </code>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {tool.description}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex justify-center">
                            <ToggleSwitch
                              checked={toolStates[tool.name] ?? true}
                              onChange={(enabled) => handleToggleTool(tool.name, enabled)}
                              disabled={toggleLoading[tool.name] || loading || bulkLoading}
                              size="sm"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {tools.length > 0 && (
              <span>
                {enabledCount} of {totalCount} tools enabled
                {bulkLoading && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">
                    • {bulkActionDescription}
                  </span>
                )}
              </span>
            )}
          </div>
          <LoadingButton
            onClick={onClose}
            variant="secondary"
            size="sm"
          >
            Close
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
