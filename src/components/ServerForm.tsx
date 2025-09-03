import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { TransportType } from '../tauri/bridge';
import type { MCPServerConfig } from '../tauri/bridge';
import { LoadingButton } from './LoadingButton';
import { ToggleSwitch } from './ToggleSwitch';
import { FormInput } from './FormInput';
import { KeyValueList } from './KeyValueList';

// FormInput moved to components/FormInput.tsx

interface ServerFormProps {
  server?: MCPServerConfig | null;
  onSave: (server: MCPServerConfig) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  existingServers?: MCPServerConfig[];
}

export function ServerForm({
  server,
  onSave,
  onCancel,
  loading = false,
  existingServers = [],
}: ServerFormProps) {
  const [formData, setFormData] = useState<MCPServerConfig>({
    name: '',
    description: '',
    transport: TransportType.Stdio,
    command: '',
    args: [],
    env: {},
    endpoint: '',
    headers: {},
    requires_auth: false,
    enabled: true,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string>('');

  useEffect(() => {
    if (server) {
      setFormData(server);
    }
  }, [server]);

  // Auto-focus the name field when form opens
  useEffect(() => {
    const nameInput = document.getElementById('server-name') as HTMLInputElement;
    if (nameInput) {
      nameInput.focus();
    }
  }, []);

  // Handle escape key to dismiss modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = 'Server name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Server name must be at least 2 characters';
    } else {
      // Check for duplicate names (excluding the current server being edited)
      const isDuplicate = existingServers.some(
        s => s.name === formData.name.trim() && s.name !== server?.name,
      );
      if (isDuplicate) {
        newErrors.name = 'A server with this name already exists';
      }
    }

    // Validate command for stdio transport
    if (formData.transport === TransportType.Stdio && !formData.command.trim()) {
      newErrors.command = 'Command is required for stdio transport';
    }

    // Validate endpoint for HTTP transports
    if (
      (formData.transport === TransportType.Sse ||
        formData.transport === TransportType.StreamableHttp) &&
      !formData.endpoint?.trim()
    ) {
      newErrors.endpoint = 'Endpoint is required for HTTP transports';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!validateForm()) {
      return;
    }

    try {
      await onSave(formData);
    } catch (error: any) {
      console.error('Failed to save server:', error);

      // Handle specific backend errors
      if (error?.message?.includes('already exists')) {
        setErrors({ name: 'A server with this name already exists' });
      } else {
        setSubmitError(error?.message || 'Failed to save server');
      }
    }
  };

  const addArg = () => {
    setFormData(prev => ({
      ...prev,
      args: [...(prev.args || []), ''],
    }));
  };

  const updateArg = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      args: (prev.args || []).map((arg, i) => (i === index ? value : arg)),
    }));
  };

  const removeArg = (index: number) => {
    setFormData(prev => ({
      ...prev,
      args: (prev.args || []).filter((_, i) => i !== index),
    }));
  };

  const addEnvVar = () => {
    setFormData(prev => ({
      ...prev,
      env: { ...prev.env, '': '' },
    }));
  };

  const updateEnvVar = (oldKey: string, newKey: string, value: string) => {
    setFormData(prev => {
      const newEnv = { ...prev.env };
      delete newEnv[oldKey];
      if (newKey) {
        newEnv[newKey] = value;
      }
      return { ...prev, env: newEnv };
    });
  };

  const removeEnvVar = (key: string) => {
    setFormData(prev => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  const addHeader = () => {
    setFormData(prev => ({
      ...prev,
      headers: { ...prev.headers, '': '' },
    }));
  };

  const updateHeader = (oldKey: string, newKey: string, value: string) => {
    setFormData(prev => {
      const newHeaders = { ...prev.headers };
      delete newHeaders[oldKey];
      if (newKey) {
        newHeaders[newKey] = value;
      }
      return { ...prev, headers: newHeaders };
    });
  };

  const removeHeader = (key: string) => {
    setFormData(prev => {
      const newHeaders = { ...prev.headers };
      delete newHeaders[key];
      return { ...prev, headers: newHeaders };
    });
  };

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
            onChange={value => {
              setFormData(prev => ({ ...prev, name: value }));
              if (errors.name) {
                setErrors(prev => ({ ...prev, name: '' }));
              }
            }}
            error={errors.name}
            required
          />

          <FormInput
            id="server-description"
            label="Description"
            value={formData.description}
            onChange={value => setFormData(prev => ({ ...prev, description: value }))}
          />

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transport Type *
            </label>
            <div className="relative">
              <select
                value={formData.transport}
                onChange={e => {
                  const newTransport = e.target.value as TransportType;
                  setFormData(prev => ({ ...prev, transport: newTransport }));
                  // Clear validation errors when switching transport types
                  setErrors(prev => {
                    const newErrors = { ...prev };
                  if (newTransport !== TransportType.Stdio) {
                      delete newErrors.command;
                    }
                    if (newTransport === TransportType.Stdio) {
                      delete newErrors.endpoint;
                    }
                    return newErrors;
                  });
                }}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 dark:focus:border-purple-400 text-sm appearance-none cursor-pointer transition-all duration-200 hover:border-gray-400 dark:hover:border-gray-600"
              >
                <option value={TransportType.Stdio}>stdio</option>
                <option value={TransportType.Sse}>sse</option>
                <option value={TransportType.StreamableHttp}>streamable http</option>
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            </div>
          </div>

          {(formData.transport === TransportType.Sse ||
            formData.transport === TransportType.StreamableHttp) && (
            <FormInput
              id="server-endpoint"
              label="Endpoint"
              value={formData.endpoint || ''}
              onChange={value => {
                setFormData(prev => ({ ...prev, endpoint: value }));
                if (errors.endpoint) {
                  setErrors(prev => ({ ...prev, endpoint: '' }));
                }
              }}
              error={errors.endpoint}
              required
              placeholder="https://example.com/mcp"
            />
          )}



          {formData.transport === TransportType.Stdio && (
            <FormInput
              id="server-command"
              label="Command"
              value={formData.command}
              onChange={value => {
                setFormData(prev => ({ ...prev, command: value }));
                if (errors.command) {
                  setErrors(prev => ({ ...prev, command: '' }));
                }
              }}
              error={errors.command}
              required
            />
          )}

          {formData.transport === TransportType.Stdio && (
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
                  className="text-xs px-1.5 py-0.5 h-5"
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
                      onChange={e => updateArg(index, e.target.value)}
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
                      ariaLabel={`Remove argument ${index + 1}`}
                    >
                      <TrashIcon className="h-3 w-3 inline-block" />
                    </LoadingButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.transport === TransportType.Stdio && (
            <KeyValueList
              label="Environment Variables"
              items={formData.env || {}}
              keyPlaceholder="Variable name"
              valuePlaceholder="Value"
              onAdd={addEnvVar}
              onUpdate={updateEnvVar}
              onRemove={removeEnvVar}
              ariaLabelBase="Environment variable"
            />
          )}

          {(formData.transport === TransportType.Sse ||
            formData.transport === TransportType.StreamableHttp) && (
            <KeyValueList
              label="HTTP Headers"
              items={formData.headers || {}}
              keyPlaceholder="Header name"
              valuePlaceholder="Value"
              onAdd={addHeader}
              onUpdate={updateHeader}
              onRemove={removeHeader}
              ariaLabelBase="HTTP header"
            />
          )}

          <div className="pt-1">
            <ToggleSwitch
              checked={formData.enabled}
              onChange={checked => setFormData(prev => ({ ...prev, enabled: checked }))}
              label="Enable server"
              size="sm"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
            <LoadingButton type="button" onClick={onCancel} variant="secondary" size="sm">
              Cancel
            </LoadingButton>
            <LoadingButton type="submit" loading={loading} size="sm">
              {server ? 'Update Server' : 'Add Server'}
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}
