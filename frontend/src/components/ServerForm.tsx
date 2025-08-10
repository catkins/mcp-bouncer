import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { LoadingButton } from './LoadingButton'

interface ServerFormProps {
  server?: MCPServerConfig | null
  onSave: (server: MCPServerConfig) => Promise<void>
  onCancel: () => void
  loading?: boolean
  existingServers?: MCPServerConfig[]
}

export function ServerForm({ server, onSave, onCancel, loading = false, existingServers = [] }: ServerFormProps) {
  const [formData, setFormData] = useState<MCPServerConfig>({
    name: '',
    description: '',
    command: '',
    args: [],
    env: {},
    enabled: true
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [submitError, setSubmitError] = useState<string>('')

  useEffect(() => {
    if (server) {
      setFormData(server)
    }
  }, [server])

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = 'Server name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Server name must be at least 2 characters'
    } else {
      // Check for duplicate names (excluding the current server being edited)
      const isDuplicate = existingServers.some(s => 
        s.name === formData.name.trim() && s.name !== server?.name
      )
      if (isDuplicate) {
        newErrors.name = 'A server with this name already exists'
      }
    }

    // Validate command
    if (!formData.command.trim()) {
      newErrors.command = 'Command is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    
    if (!validateForm()) {
      return
    }

    try {
      await onSave(formData)
    } catch (error: any) {
      console.error('Failed to save server:', error)
      
      // Handle specific backend errors
      if (error?.message?.includes('already exists')) {
        setErrors({ name: 'A server with this name already exists' })
      } else {
        setSubmitError(error?.message || 'Failed to save server')
      }
    }
  }

  const addArg = () => {
    setFormData(prev => ({
      ...prev,
      args: [...(prev.args || []), '']
    }))
  }

  const updateArg = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      args: (prev.args || []).map((arg, i) => i === index ? value : arg)
    }))
  }

  const removeArg = (index: number) => {
    setFormData(prev => ({
      ...prev,
      args: (prev.args || []).filter((_, i) => i !== index)
    }))
  }

  const addEnvVar = () => {
    setFormData(prev => ({
      ...prev,
      env: { ...prev.env, '': '' }
    }))
  }

  const updateEnvVar = (oldKey: string, newKey: string, value: string) => {
    setFormData(prev => {
      const newEnv = { ...prev.env }
      delete newEnv[oldKey]
      if (newKey) {
        newEnv[newKey] = value
      }
      return { ...prev, env: newEnv }
    })
  }

  const removeEnvVar = (key: string) => {
    setFormData(prev => {
      const newEnv = { ...prev.env }
      delete newEnv[key]
      return { ...prev, env: newEnv }
    })
  }

  const getInputClassName = (fieldName: string) => {
    const baseClasses = "w-full px-3 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:border-transparent"
    const errorClasses = "border-red-500 focus:ring-red-500"
    const normalClasses = "border-gray-300 dark:border-gray-700 focus:ring-blue-500"
    
    return `${baseClasses} ${errors[fieldName] ? errorClasses : normalClasses}`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {server ? 'Edit Server' : 'Add Server'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, name: e.target.value }))
                if (errors.name) {
                  setErrors(prev => ({ ...prev, name: '' }))
                }
              }}
              className={getInputClassName('name')}
              required
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className={getInputClassName('description')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Command *
            </label>
            <input
              type="text"
              value={formData.command}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, command: e.target.value }))
                if (errors.command) {
                  setErrors(prev => ({ ...prev, command: '' }))
                }
              }}
              className={getInputClassName('command')}
              required
            />
            {errors.command && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.command}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Arguments
              </label>
              <LoadingButton
                type="button"
                onClick={addArg}
                variant="secondary"
                size="sm"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </LoadingButton>
            </div>
            <div className="space-y-2">
              {(formData.args || []).map((arg, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={arg}
                    onChange={(e) => updateArg(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Argument"
                  />
                  <LoadingButton
                    type="button"
                    onClick={() => removeArg(index)}
                    variant="danger"
                    size="sm"
                    className="p-2"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </LoadingButton>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Environment Variables
              </label>
              <LoadingButton
                type="button"
                onClick={addEnvVar}
                variant="secondary"
                size="sm"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </LoadingButton>
            </div>
            <div className="space-y-2">
              {Object.entries(formData.env || {}).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => updateEnvVar(key, e.target.value, value)}
                    className="w-1/3 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Variable name"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateEnvVar(key, key, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Value"
                  />
                  <LoadingButton
                    type="button"
                    onClick={() => removeEnvVar(key)}
                    variant="danger"
                    size="sm"
                    className="p-2"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </LoadingButton>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:bg-gray-800"
            />
            <label htmlFor="enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Enable server
            </label>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800">
          <LoadingButton
            type="button"
            onClick={onCancel}
            variant="secondary"
            size="md"
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            type="submit"
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
            loading={loading}
            size="md"
          >
            {server ? 'Update Server' : 'Add Server'}
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}
