import { useState } from 'react'
import { TrashIcon } from '@heroicons/react/24/outline'
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
                      value={String(value)}
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
