import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ExclamationTriangleIcon, PlusIcon, TrashIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { TransportType } from '../../tauri/bridge';
import type { MCPServerConfig } from '../../tauri/bridge';
import { LoadingButton } from '../LoadingButton';
import { ToggleSwitch } from '../ToggleSwitch';
import { FormInput } from '../FormInput';
import { KeyValueList } from '../KeyValueList';
import { DropdownSelect } from '../DropdownSelect';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
    enabled: true,
  });
  const idSeq = React.useRef(0);
  const nextId = () => `row-${++idSeq.current}`;
  const [envList, setEnvList] = useState<Array<{ id: string; key: string; value: string }>>([]);
  const [headerList, setHeaderList] = useState<Array<{ id: string; key: string; value: string }>>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [submitError, setSubmitError] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (server) {
      setFormData(server);
      const envEntries = Object.entries((server.env ?? {}) as Record<string, string>) as Array<
        [string, string]
      >;
      setEnvList(envEntries.map(([k, v]) => ({ id: nextId(), key: k, value: v })));
      const headerEntries = Object.entries((server.headers ?? {}) as Record<string, string>) as Array<
        [string, string]
      >;
      setHeaderList(headerEntries.map(([k, v]) => ({ id: nextId(), key: k, value: v })));
    } else {
      setEnvList([]);
      setHeaderList([]);
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

  useFocusTrap(containerRef as React.RefObject<HTMLElement>, true, {
    initialFocusSelector: '[data-close-button]',
  });

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
      const env: Record<string, string> = {};
      for (const { key, value } of envList) if (key) env[key] = value;
      const headers: Record<string, string> = {};
      for (const { key, value } of headerList) if (key) headers[key] = value;
      const payload: MCPServerConfig = { ...formData, env, headers };
      await onSave(payload);
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
    setFormData((prev: MCPServerConfig) => ({
      ...prev,
      args: [...(prev.args || []), ''],
    }));
  };

  const updateArg = (index: number, value: string) => {
    setFormData((prev: MCPServerConfig) => ({
      ...prev,
      args: (prev.args || []).map((arg: string, i: number) => (i === index ? value : arg)),
    }));
  };

  const removeArg = (index: number) => {
    setFormData((prev: MCPServerConfig) => ({
      ...prev,
      args: (prev.args || []).filter((_v: string, i: number) => i !== index),
    }));
  };

  const addEnvVar = () => {
    setEnvList((prev: Array<{ id: string; key: string; value: string }>) => [
      ...prev,
      { id: nextId(), key: '', value: '' },
    ]);
  };

  const updateEnvVar = (index: number, _oldKey: string, newKey: string, value: string) => {
    setEnvList((prev: Array<{ id: string; key: string; value: string }>) =>
      prev.map((row, i) => (i === index ? { ...row, key: newKey, value } : row))
    );
  };

  const removeEnvVar = (key: string) => {
    setEnvList((prev: Array<{ id: string; key: string; value: string }>) => {
      const idx = prev.findIndex(r => r.key === key);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  };

  const addHeader = () => {
    setHeaderList((prev: Array<{ id: string; key: string; value: string }>) => [
      ...prev,
      { id: nextId(), key: '', value: '' },
    ]);
  };

  const updateHeader = (index: number, _oldKey: string, newKey: string, value: string) => {
    setHeaderList((prev: Array<{ id: string; key: string; value: string }>) =>
      prev.map((row, i) => (i === index ? { ...row, key: newKey, value } : row))
    );
  };

  const removeHeader = (key: string) => {
    setHeaderList((prev: Array<{ id: string; key: string; value: string }>) => {
      const idx = prev.findIndex(r => r.key === key);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} role="presentation" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-form-title"
        className="relative flex w-full max-w-3xl flex-col rounded-2xl border border-surface-200 bg-surface-50/95 shadow-2xl dark:border-surface-800 dark:bg-surface-900/95 max-h-[90vh] min-h-0 overflow-hidden"
      >
        <div className="flex flex-shrink-0 items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
          <div className="flex items-center gap-3">
            <WrenchScrewdriverIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <div>
              <h3 id="server-form-title" className="text-lg font-semibold text-surface-900 dark:text-white">
                {server ? 'Edit MCP Server' : 'Add MCP Server'}
              </h3>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                Configure transports, commands, and headers for this upstream MCP endpoint.
              </p>
            </div>
          </div>
          <LoadingButton
            variant="secondary"
            size="sm"
            className="p-1.5"
            onClick={onCancel}
            ariaLabel="Close server form"
            data-close-button
          >
            <XMarkIcon className="h-4 w-4" />
          </LoadingButton>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            {/* Submit error */}
            {submitError && (
              <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            <section className="space-y-3 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900/60">
              <div>
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Server details</p>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Friendly names help you recognize servers across tabs.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormInput
                  id="server-name"
                  label="Name"
                  value={formData.name}
                  onChange={value => {
                    setFormData((prev: MCPServerConfig) => ({ ...prev, name: value }));
                    if (errors.name) {
                      setErrors((prev: Record<string, string>) => ({ ...prev, name: '' }));
                    }
                  }}
                  {...(errors.name ? { error: errors.name } : {})}
                  required
                />
                <FormInput
                  id="server-description"
                  label="Description"
                  value={formData.description}
                  onChange={value => setFormData((prev: MCPServerConfig) => ({ ...prev, description: value }))}
                />
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900/60">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Transport</p>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Choose how MCP Bouncer should reach this upstream.
                </p>
              </div>
              <DropdownSelect
                label="Transport type"
                value={formData.transport}
                onChange={event => {
                  const newTransport = event.target.value as TransportType;
                  setFormData((prev: MCPServerConfig) => ({ ...prev, transport: newTransport }));
                  setErrors((prev: Record<string, string>) => {
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
                options={[
                  { value: TransportType.Stdio, label: 'stdio' },
                  { value: TransportType.Sse, label: 'sse' },
                  { value: TransportType.StreamableHttp, label: 'streamable http' },
                ]}
                fullWidth
              />

              {(formData.transport === TransportType.Sse ||
                formData.transport === TransportType.StreamableHttp) && (
                  <FormInput
                    id="server-endpoint"
                    label="Endpoint"
                    value={formData.endpoint || ''}
                    onChange={value => {
                      setFormData((prev: MCPServerConfig) => ({ ...prev, endpoint: value }));
                      if (errors.endpoint) {
                        setErrors((prev: Record<string, string>) => ({ ...prev, endpoint: '' }));
                      }
                    }}
                    {...(errors.endpoint ? { error: errors.endpoint } : {})}
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
                    setFormData((prev: MCPServerConfig) => ({ ...prev, command: value }));
                    if (errors.command) {
                      setErrors((prev: Record<string, string>) => ({ ...prev, command: '' }));
                    }
                  }}
                  {...(errors.command ? { error: errors.command } : {})}
                  required
                />
              )}
            </section>

            {formData.transport === TransportType.Stdio && (
              <section className="space-y-3 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900/60">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Command options</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Pass arguments and env vars to your stdio server.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-surface-700 dark:text-surface-200">Arguments</label>
                    <LoadingButton type="button" onClick={addArg} variant="secondary" size="sm" className="text-xs px-2 py-1">
                      <PlusIcon className="h-3 w-3" />
                      Add
                    </LoadingButton>
                  </div>
                  <div className="space-y-2">
                    {(formData.args || []).map((arg, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={arg}
                          onChange={e => updateArg(index, e.target.value)}
                          className="flex-1 rounded-md border border-surface-300 bg-surface-100 px-2 py-1.5 text-sm text-surface-900 focus:border-transparent focus:ring-2 focus:ring-brand-400 dark:border-surface-600 dark:bg-surface-800 dark:text-white dark:focus:ring-brand-500"
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
                          <TrashIcon className="h-3 w-3" />
                        </LoadingButton>
                      </div>
                    ))}
                  </div>
                </div>

                <KeyValueList
                  label="Environment Variables"
                  items={Object.fromEntries(envList.map(r => [r.key, r.value]))}
                  keyPlaceholder="Variable name"
                  valuePlaceholder="Value"
                  onAdd={addEnvVar}
                  onUpdate={updateEnvVar}
                  onRemove={removeEnvVar}
                  ariaLabelBase="Environment variable"
                />
              </section>
            )}

            {(formData.transport === TransportType.Sse ||
              formData.transport === TransportType.StreamableHttp) && (
                <section className="space-y-3 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900/60">
                  <div>
                    <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">HTTP headers</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">Attach tokens or custom metadata.</p>
                  </div>
                  <KeyValueList
                    label="Headers"
                    items={Object.fromEntries(headerList.map(r => [r.key, r.value]))}
                    keyPlaceholder="Header name"
                    valuePlaceholder="Value"
                    onAdd={addHeader}
                    onUpdate={updateHeader}
                    onRemove={removeHeader}
                    ariaLabelBase="HTTP header"
                  />
                </section>
              )}

            <section className="space-y-3 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900/60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Status</p>
                  <p className="text-xs text-surface-500 dark:text-surface-400">Disabled servers stay in your list but won’t connect.</p>
                </div>
                <ToggleSwitch
                  checked={formData.enabled}
                  onChange={checked => setFormData((prev: MCPServerConfig) => ({ ...prev, enabled: checked }))}
                  label="Enable server"
                  size="sm"
                />
              </div>
            </section>
          </div>
          <div className="flex-shrink-0 border-t border-surface-200 bg-white/95 px-5 py-3 dark:border-surface-800 dark:bg-surface-900/95">
            <div className="flex items-center justify-end gap-3">
              <LoadingButton type="button" onClick={onCancel} variant="secondary" size="sm">
                Cancel
              </LoadingButton>
              <LoadingButton type="submit" loading={loading} size="sm">
                {server ? 'Update Server' : 'Add Server'}
              </LoadingButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
