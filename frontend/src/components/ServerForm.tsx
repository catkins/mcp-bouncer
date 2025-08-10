import { useState } from 'react'
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'

interface ServerFormProps {
  server?: MCPServerConfig | null
  onSave: (server: MCPServerConfig) => Promise<void>
  onCancel: () => void
}

export function ServerForm({ server, onSave, onCancel }: ServerFormProps) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await onSave(formData)
    } catch (error) {
      console.error('Failed to save server:', error)
      // You might want to show an error message to the user here
    }
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {server ? 'Edit MCP Server' : 'Add MCP Server'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="e.g., filesystem"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="e.g., Filesystem MCP server for file operations"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Command *
              </label>
              <input
                type="text"
                required
                value={formData.command}
                onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="e.g., npx, python, node"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeArg(index)}
                      className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newArg}
                    onChange={(e) => setNewArg(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArg())}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Add argument..."
                  />
                  <button
                    type="button"
                    onClick={addArg}
                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Environment Variables
              </label>
              <div className="space-y-2">
                {Object.entries(formData.env || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={key}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={String(value)}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(key)}
                      className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newEnvKey}
                    onChange={(e) => setNewEnvKey(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Variable name"
                  />
                  <input
                    type="text"
                    value={newEnvValue}
                    onChange={(e) => setNewEnvValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addEnvVar())}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="Variable value"
                  />
                  <button
                    type="button"
                    onClick={addEnvVar}
                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
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
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
              <label htmlFor="enabled" className="ml-2 block text-sm text-gray-900 dark:text-white">
                Enable this server
              </label>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            {server ? 'Update Server' : 'Add Server'}
          </button>
        </div>
      </div>
    </div>
  )
}
