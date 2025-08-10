import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { MCPServerConfig } from '../../bindings/github.com/catkins/mcp-bouncer-poc/pkg/services/settings/models'
import { LoadingButton } from './LoadingButton'
import { ToggleSwitch } from './ToggleSwitch'

interface FormInputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  placeholder?: string
  type?: string
}

function FormInput({ id, label, value, onChange, error, required = false, placeholder, type = 'text' }: FormInputProps) {
  const getInputClassName = () => {
    const baseClasses = "w-full px-2 py-1.5 border rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:border-transparent text-sm"
    const errorClasses = "border-red-500 focus:ring-red-500"
    const normalClasses = "border-gray-300 dark:border-gray-700 focus:ring-purple-500 dark:focus:ring-purple-400"
    
    return `${baseClasses} ${error ? errorClasses : normalClasses}`
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label} {required && '*'}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={getInputClassName()}
        required={required}
        placeholder={placeholder}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

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

  // Auto-focus the name field when form opens
  useEffect(() => {
    const nameInput = document.getElementById('server-name') as HTMLInputElement
    if (nameInput) {
      nameInput.focus()
    }
  }, [])

  // Handle escape key to dismiss modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onCancel])

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



  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl shadow-xl max-w-xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {server ? 'Edit Server' : 'Add Server'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 space-y-3">
          {/* Submit error */}
          {submitError && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            </div>
          )}

          <FormInput
            id="server-name"
            label="Name"
            value={formData.name}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, name: value }))
              if (errors.name) {
                setErrors(prev => ({ ...prev, name: '' }))
              }
            }}
            error={errors.name}
            required
          />

          <FormInput
            id="server-description"
            label="Description"
            value={formData.description}
            onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
          />

          <FormInput
            id="server-command"
            label="Command"
            value={formData.command}
            onChange={(value) => {
              setFormData(prev => ({ ...prev, command: value }))
              if (errors.command) {
                setErrors(prev => ({ ...prev, command: '' }))
              }
            }}
            error={errors.command}
            required
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Arguments
              </label>
              <LoadingButton
                type="button"
                onClick={addArg}
                variant="secondary"
                size="sm"
                className="text-xs px-1.5 py-0.5 h-5 text-xs"
              >
                <PlusIcon className="h-2.5 w-2.5 inline-block" />
                Add
              </LoadingButton>
            </div>
            <div className="space-y-1.5">
              {(formData.args || []).map((arg, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={arg}
                    onChange={(e) => updateArg(index, e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent text-sm"
                    placeholder="Argument"
                    aria-label={`Argument ${index + 1}`}
                  />
                  <LoadingButton
                    type="button"
                    onClick={() => removeArg(index)}
                    variant="danger"
                    size="sm"
                    className="p-1.5"
                    aria-label={`Remove argument ${index + 1}`}
                  >
                    <TrashIcon className="h-3 w-3 inline-block" />
                  </LoadingButton>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                Environment Variables
              </label>
              <LoadingButton
                type="button"
                onClick={addEnvVar}
                variant="secondary"
                size="sm"
                className="text-xs px-1.5 py-0.5 h-5 text-xs"
              >
                <PlusIcon className="h-2.5 w-2.5 inline-block" />
                Add
              </LoadingButton>
            </div>
            <div className="space-y-1.5">
              {Object.entries(formData.env || {}).map(([key, value], index) => (
                <div key={key} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={key}
                    onChange={(e) => updateEnvVar(key, e.target.value, value)}
                    className="w-1/3 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent text-sm"
                    placeholder="Variable name"
                    aria-label={`Environment variable name ${index + 1}`}
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateEnvVar(key, key, e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-transparent text-sm"
                    placeholder="Value"
                    aria-label={`Environment variable value ${index + 1}`}
                  />
                  <LoadingButton
                    type="button"
                    onClick={() => removeEnvVar(key)}
                    variant="danger"
                    size="sm"
                    className="p-1.5"
                    aria-label={`Remove environment variable ${key}`}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </LoadingButton>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1">
            <ToggleSwitch
              checked={formData.enabled}
              onChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
              label="Enable server"
              size="sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
            <LoadingButton
              type="button"
              onClick={onCancel}
              variant="secondary"
              size="sm"
            >
              Cancel
            </LoadingButton>
            <LoadingButton
              type="submit"
              loading={loading}
              size="sm"
            >
              {server ? 'Update Server' : 'Add Server'}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  )
}
