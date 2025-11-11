import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Cog6ToothIcon, FolderOpenIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { ServerTransport, Settings, SocketBridgeInfo } from '../../tauri/bridge';
import { FormInput } from '../FormInput';
import { LoadingButton } from '../LoadingButton';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useToast } from '../../contexts/ToastContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings | null;
  settingsPath?: string;
  socketBridgePath: SocketBridgeInfo | null;
  onSave: (next: Settings) => Promise<void>;
  onOpenDirectory: () => Promise<void>;
}

type FieldErrors = { listen_addr?: string };

const transportOptions: Array<{
  value: ServerTransport;
  label: string;
  description: string;
  detail: string;
}> = [
  {
    value: 'streamable_http',
    label: 'Local HTTP (streamable_http)',
    description: 'Expose the MCP proxy on http://127.0.0.1:8091/mcp (or a fallback port).',
    detail: 'Uses the MCP streamable HTTP transport and keeps traffic on localhost only.',
  },
  {
    value: 'unix',
    label: 'Unix domain socket (unix)',
    description: 'Bind to /tmp/mcp-bouncer.sock instead of a TCP port (macOS/Linux only).',
    detail: 'Pair with the mcp-bouncer-socket-bridge helper to forward stdio clients securely.',
  },
];

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  settingsPath,
  socketBridgePath,
  onSave,
  onOpenDirectory,
}: SettingsModalProps) {
  const [formState, setFormState] = useState<Settings | null>(settings);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [openingDir, setOpeningDir] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setFormState(settings);
      setFieldErrors({});
      setSubmitError('');
    }
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useFocusTrap(containerRef as RefObject<HTMLElement>, isOpen, {
    initialFocusSelector: '[data-initial-focus]',
  });

  if (!isOpen) return null;

  const currentTransport = formState?.transport;
  const isHttp = currentTransport === 'streamable_http';
  const bridgeBinaryPath = socketBridgePath?.path || './target/release/mcp-bouncer-socket-bridge';

  const handleTransportChange = (value: ServerTransport) => {
    if (!formState) return;
    setFormState({ ...formState, transport: value });
  };

  const handleListenAddrChange = (value: string) => {
    if (!formState) return;
    setFormState({ ...formState, listen_addr: value });
  };

  const validate = () => {
    if (!formState) return false;
    const nextErrors: FieldErrors = {};
    if (formState.transport === 'streamable_http' && !formState.listen_addr.trim()) {
      nextErrors.listen_addr = 'Listen address is required for streamable_http mode';
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const describeTransport = (next: Settings) => {
    if (next.transport === 'streamable_http') {
      return `Listening at ${next.listen_addr}`;
    }
    if (next.transport === 'unix') {
      return 'Unix socket mode enabled (/tmp/mcp-bouncer.sock)';
    }
    return 'Transport updated';
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formState) return;
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    try {
      const payload: Settings = {
        ...formState,
        listen_addr: formState.listen_addr.trim(),
      };
      await onSave(payload);
      addToast({
        type: 'success',
        title: 'Settings saved',
        message: describeTransport(payload),
        duration: 4000,
      });
      onClose();
    } catch (error: any) {
      const message = error?.message || 'Failed to save settings';
      setSubmitError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDirectory = async () => {
    setOpeningDir(true);
    try {
      await onOpenDirectory();
    } catch (error) {
      console.error('Failed to open config directory:', error);
      setSubmitError('Unable to open the config directory');
    } finally {
      setOpeningDir(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="relative w-full max-w-3xl mx-4 bg-surface-50 dark:bg-surface-900 rounded-lg shadow-xl border border-surface-200 dark:border-surface-700"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <Cog6ToothIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            <div>
              <h2 id="settings-modal-title" className="text-lg font-semibold text-surface-900 dark:text-white">
                Proxy Settings
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400">
                Choose how MCP Bouncer exposes its local endpoint.
              </p>
            </div>
          </div>
          <LoadingButton
            variant="secondary"
            size="sm"
            className="p-1.5"
            ariaLabel="Close settings modal"
            data-initial-focus
            onClick={onClose}
          >
            <XMarkIcon className="h-4 w-4" />
          </LoadingButton>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto">
          {!formState ? (
            <div className="flex items-center justify-center py-16 text-sm text-surface-500 dark:text-surface-400">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                Loading settings...
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                  Transport
                </h3>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Pick how downstream clients should reach MCP Bouncer. You can switch modes at any time.
                </p>
                <div className="space-y-3">
                  {transportOptions.map(option => (
                    <label
                      key={option.value}
                      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                        currentTransport === option.value
                          ? 'border-brand-400 bg-brand-50/60 dark:border-brand-500/70 dark:bg-brand-500/10'
                          : 'border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="transport"
                          value={option.value}
                          checked={currentTransport === option.value}
                          onChange={() => handleTransportChange(option.value)}
                          className="h-4 w-4 text-brand-500 focus:ring-brand-400"
                        />
                        <div>
                          <p className="text-sm font-medium text-surface-900 dark:text-surface-50">
                            {option.label}
                          </p>
                          <p className="text-xs text-surface-500 dark:text-surface-400">{option.description}</p>
                        </div>
                      </div>
                      <p className="ml-6 text-xs text-surface-400 dark:text-surface-500">{option.detail}</p>
                    </label>
                  ))}
                  <p className="text-[11px] text-surface-500 dark:text-surface-400">
                    Need stdio-only clients? Build the <code>mcp-bouncer-socket-bridge</code>
                    helper (run <code>npm run build:bridge</code>) and point it at the unix
                    socket path when you switch modes.
                  </p>
                  {currentTransport === 'unix' && (
                    <div className="rounded-md border border-dashed border-surface-200 bg-surface-50 p-3 text-[11px] text-surface-600 dark:border-surface-600 dark:bg-surface-800/50 dark:text-surface-300">
                      <p className="font-semibold text-surface-800 dark:text-surface-100">Bridge connection instructions</p>
                      <ol className="list-decimal pl-5">
                        <li>Run <code>npm run build:bridge</code> (or the release variant) to build the helper.</li>
                        <li>
                          Launch the helper (matches the header path):
                          <div className="mt-1 rounded bg-black/5 px-2 py-1 font-mono text-[10px] break-all dark:bg-white/10">
                            <code>{bridgeBinaryPath}</code>
                          </div>
                          <p className="mt-1 text-[10px] text-surface-500 dark:text-surface-400">
                            Defaults: <code>--socket /tmp/mcp-bouncer.sock</code>, <code>--endpoint /mcp</code>. Only override if you customized the backend path.
                          </p>
                        </li>
                        <li>Point stdio clients (e.g., <code>mcp-remote</code>) at that helper binary.</li>
                      </ol>
                      <p className="mt-2">The header shows the bridge path once the binary exists locally.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <FormInput
                  id="listen-addr"
                  label="HTTP listen address"
                  value={formState.listen_addr}
                  onChange={handleListenAddrChange}
                  error={fieldErrors.listen_addr ?? null}
                  placeholder="http://127.0.0.1:8091/mcp"
                  disabled={!isHttp}
                />
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  {isHttp
                    ? 'Shown to MCP clients when streamable_http mode is active. Change the host or port if 8091 is busy.'
                    : 'Listen address is ignored when unix mode is active.'}
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">Settings file</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400">
                      JSON containing transport mode, listen address, and saved MCP servers.
                    </p>
                  </div>
                  <LoadingButton
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                    onClick={handleOpenDirectory}
                    loading={openingDir}
                    type="button"
                    ariaLabel="Open config directory"
                  >
                    <FolderOpenIcon className="h-4 w-4" />
                    Open Directory
                  </LoadingButton>
                </div>
                <div className="rounded-md border border-dashed border-surface-300 dark:border-surface-700 bg-surface-100/70 dark:bg-surface-800/50 px-3 py-2 text-xs font-mono text-surface-700 dark:text-surface-200 break-all">
                  {settingsPath && settingsPath.trim().length > 0
                    ? settingsPath
                    : 'File will be created after you save settings.'}
                </div>
              </section>

              {submitError && (
                <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <LoadingButton
                  variant="secondary"
                  type="button"
                  onClick={onClose}
                  size="sm"
                >
                  Cancel
                </LoadingButton>
                <LoadingButton
                  type="submit"
                  loading={saving}
                  size="sm"
                >
                  Save Changes
                </LoadingButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
