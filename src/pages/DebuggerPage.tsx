import { useEffect, useMemo, useState, useCallback } from 'react';
import type {
  MCPServerConfig,
  ClientStatus,
  Tool,
  DebugCallToolResponse,
} from '../tauri/bridge';
import { MCPService } from '../tauri/bridge';
import { LoadingButton } from '../components/LoadingButton';
import { HighlightedJson } from '../components/logs/HighlightedJson';
import { ToggleSwitch } from '../components/ToggleSwitch';
import {
  BugAntIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

type PrimitiveFieldType = 'string' | 'number' | 'integer' | 'boolean';

interface SchemaField {
  name: string;
  type: PrimitiveFieldType | 'array';
  itemType?: PrimitiveFieldType;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

interface ParsedSchema {
  fields: SchemaField[];
  supportsForm: boolean;
}

interface CallOutcome {
  timestamp: number;
  ok: boolean;
  durationMs: number;
  result: unknown;
  request: unknown;
}

function extractToolError(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const isExplicitError =
    record.is_error === true ||
    record.isError === true ||
    record.ok === false ||
    record.success === false;

  const tryString = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const fromMeta = () => {
    const meta = record.meta;
    if (meta && typeof meta === 'object') {
      return tryString((meta as Record<string, unknown>).error ?? (meta as Record<string, unknown>).message);
    }
    return null;
  };

  const fromContentArray = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    for (const entry of value) {
      if (typeof entry === 'string') {
        const text = tryString(entry);
        if (text) return text;
        continue;
      }
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const text = tryString(obj.text ?? obj.message);
        if (text) return text;
        const data = obj.output ?? obj.data;
        if (data && typeof data === 'object') {
          const nestedText = tryString((data as Record<string, unknown>).text);
          if (nestedText) return nestedText;
        }
      }
    }
    return null;
  };

  const sources = [
    tryString(record.error ?? record.message),
    fromMeta(),
    fromContentArray(record.content ?? record.contents),
    fromContentArray(record.structured_content ?? record.structuredContent),
  ];

  const message = sources.find(text => text != null) ?? null;
  if (message) return message;
  return isExplicitError ? JSON.stringify(result) : null;
}

interface DebuggerPageProps {
  servers: MCPServerConfig[];
  clientStatus: Record<string, ClientStatus>;
  eligibleServers: string[];
  selectedServer: string | null;
  onSelectServer: (serverName: string | null) => void;
  statusLoaded: boolean;
}

export default function DebuggerPage({
  servers,
  clientStatus,
  eligibleServers,
  selectedServer,
  onSelectServer,
  statusLoaded,
}: DebuggerPageProps) {
  const serverLookup = useMemo(() => {
    const map = new Map<string, MCPServerConfig>();
    servers.forEach(server => map.set(server.name, server));
    return map;
  }, [servers]);

  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callResult, setCallResult] = useState<CallOutcome | null>(null);

  const selectedStatus = selectedServer ? clientStatus[selectedServer] : undefined;
  const serverEligible = Boolean(selectedServer && eligibleServers.includes(selectedServer));

  const loadTools = useCallback(async (target: string) => {
    setToolsLoading(true);
    setToolsError(null);
    try {
      const list = await MCPService.GetClientTools(target);
      setTools(list);
      setSelectedToolName(prev => {
        if (prev && list.some(tool => tool.name === prev)) return prev;
        return list[0]?.name ?? null;
      });
    } catch (error) {
      console.error('Failed to load tools', error);
      setTools([]);
      setSelectedToolName(null);
      setToolsError(error instanceof Error ? error.message : 'Failed to load tools');
    } finally {
      setToolsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedServer) {
      setTools([]);
      setSelectedToolName(null);
      return;
    }
    if (!serverEligible) {
      setTools([]);
      setSelectedToolName(null);
      return;
    }
    void loadTools(selectedServer);
  }, [selectedServer, serverEligible, loadTools]);

  const filteredTools = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tools;
    return tools.filter(tool => {
      const name = tool.name.toLowerCase();
      const desc = tool.description?.toLowerCase() ?? '';
      return name.includes(term) || desc.includes(term);
    });
  }, [tools, search]);

  const selectedTool = selectedToolName
    ? tools.find(tool => tool.name === selectedToolName) ?? null
    : null;

  const handleRefreshTools = async () => {
    if (!selectedServer) return;
    setToolsLoading(true);
    setToolsError(null);
    try {
      await MCPService.RefreshClientTools(selectedServer);
      await loadTools(selectedServer);
    } catch (error) {
      console.error('Failed to refresh tools', error);
      setToolsError(error instanceof Error ? error.message : 'Failed to refresh tools');
    } finally {
      setToolsLoading(false);
    }
  };

  const handleSubmit = async (payload?: Record<string, unknown>) => {
    if (!selectedServer || !selectedTool) return;
    setCallError(null);
    setCallLoading(true);
    try {
      const response: DebugCallToolResponse = await MCPService.DebugCallTool(
        selectedServer,
        selectedTool.name,
        payload ?? null,
      );
      const outcome: CallOutcome = {
        timestamp: Date.now(),
        ok: response.ok,
        durationMs: response.duration_ms,
        result: response.result,
        request: response.request_arguments ?? (payload ?? null),
      };
      setCallResult(outcome);
    } catch (error) {
      console.error('Tool call failed', error);
      setCallError(error instanceof Error ? error.message : 'Tool call failed');
    } finally {
      setCallLoading(false);
    }
  };

  if (!statusLoaded) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-gray-800/40">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          Loading client status…
        </div>
      </div>
    );
  }

  if (eligibleServers.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white/70 dark:bg-gray-800/40">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center text-sm text-gray-600 dark:text-gray-300">
          <BugAntIcon className="h-8 w-8 text-amber-500" />
          <p className="font-medium">No connected servers available for debugging</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enable and connect a server with tools from the Servers tab to start debugging tool calls.
          </p>
        </div>
      </div>
    );
  }

  const serverOptions = eligibleServers.map(name => ({
    name,
    description: serverLookup.get(name)?.description ?? '',
  }));

  return (
    <div className="flex min-h-[calc(100vh-220px)] flex-col gap-4">
      <DebuggerHeader
        selectedServer={selectedServer}
        serverOptions={serverOptions}
        onSelectServer={onSelectServer}
        serverEligible={serverEligible}
        {...(selectedStatus ? { status: selectedStatus } : {})}
      />

      {!selectedServer || !serverEligible ? (
        <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40">
          <div className="flex max-w-md flex-col items-center gap-2 text-center text-sm text-gray-600 dark:text-gray-300">
            <DocumentTextIcon className="h-8 w-8 text-blue-500" />
            <p className="font-medium">
              {selectedServer
                ? 'Debugger is available only for connected servers with tools.'
                : 'Select a server to begin debugging its tools.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-stretch">
          <ToolListPanel
            tools={tools}
            filteredTools={filteredTools}
            selectedToolName={selectedToolName}
            onSelectTool={setSelectedToolName}
            loading={toolsLoading}
            error={toolsError}
            onRefresh={handleRefreshTools}
            search={search}
            onSearchChange={setSearch}
          />
          <div className="grid min-h-0 min-w-0 gap-4 lg:grid-rows-[minmax(260px,360px)_minmax(240px,1fr)]">
            <RequestPanel
              tool={selectedTool}
              disabled={!serverEligible || toolsLoading}
              loading={callLoading}
              onSubmit={handleSubmit}
            />
            <ResponsePanel
              callResult={callResult}
              callError={callError}
              selectedToolName={selectedTool?.name ?? null}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DebuggerHeader({
  selectedServer,
  serverOptions,
  status,
  onSelectServer,
  serverEligible,
}: {
  selectedServer: string | null;
  serverOptions: { name: string; description: string }[];
  status?: ClientStatus;
  onSelectServer: (name: string | null) => void;
  serverEligible: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tool Debugger</h2>
        {selectedServer ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span>{selectedServer}</span>
            {status ? <StatusPill status={status} /> : null}
            {!serverEligible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <ExclamationCircleIcon className="h-3 w-3" />
                Not connected
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a connected server to inspect its tools.</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Server
        </label>
        <select
          value={selectedServer ?? ''}
          onChange={event => onSelectServer(event.target.value || null)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          <option value="" disabled>
            Choose server
          </option>
          {serverOptions.map(option => (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: ClientStatus }) {
  switch (status.state) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
          <CheckCircleIcon className="h-3 w-3" />
          Connected · {status.tools} tools
        </span>
      );
    case 'connecting':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          <ArrowPathIcon className="h-3 w-3 animate-spin" />
          Connecting
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-700/40 dark:text-gray-200">
          <XCircleIcon className="h-3 w-3" />
          {status.state.replace('_', ' ')}
        </span>
      );
  }
}

function ToolListPanel({
  tools,
  filteredTools,
  selectedToolName,
  onSelectTool,
  loading,
  error,
  onRefresh,
  search,
  onSearchChange,
}: {
  tools: Tool[];
  filteredTools: Tool[];
  selectedToolName: string | null;
  onSelectTool: (name: string | null) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-gray-200 bg-white/90 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <WrenchScrewdriverIcon className="h-4 w-4" />
          Tools
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({tools.length})</span>
        </div>
        <LoadingButton
          onClick={onRefresh}
          loading={loading}
          variant="secondary"
          size="sm"
          className="px-2 py-1 text-xs"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </LoadingButton>
      </div>
      <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Filter tools"
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-7 pr-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-sm text-red-500 dark:text-red-400">{error}</div>
        ) : filteredTools.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">No tools match the current filter.</div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTools.map(tool => (
              <li key={tool.name}>
                <button
                  className={`flex w-full flex-col items-start gap-1 px-3 py-2 text-left transition hover:bg-blue-50/60 dark:hover:bg-blue-900/20 ${
                    tool.name === selectedToolName
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                      : 'text-gray-700 dark:text-gray-200'
                  }`}
                  onClick={() => onSelectTool(tool.name)}
                >
                  <span className="text-sm font-medium">
                    {tool.name.split('::').length > 1 ? tool.name.split('::')[1] : tool.name}
                  </span>
                  {tool.description ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {tool.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RequestPanel({
  tool,
  disabled,
  loading,
  onSubmit,
}: {
  tool: Tool | null;
  disabled: boolean;
  loading: boolean;
  onSubmit: (payload?: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Request</h3>
        </div>
        {tool?.description ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">{tool.description}</span>
        ) : null}
      </div>
      {!tool ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Select a tool to configure the request arguments.
        </div>
      ) : (
        <ToolRequestForm tool={tool} disabled={disabled} loading={loading} onSubmit={onSubmit} />
      )}
    </div>
  );
}

function ResponsePanel({
  callResult,
  callError,
  selectedToolName,
}: {
  callResult: CallOutcome | null;
  callError: string | null;
  selectedToolName: string | null;
}) {
  const toolErrorMessage = useMemo(() => {
    if (!callResult) return null;
    const message = extractToolError(callResult.result);
    if (!message) return null;
    if (!callResult.ok) return message;
    const lowered = message.toLowerCase();
    return lowered.includes('error') || lowered.includes('fail') ? message : null;
  }, [callResult]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Response</h3>
        </div>
        {callResult && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            callResult.ok
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          }`}>
            {callResult.ok ? <CheckCircleIcon className="h-3 w-3" /> : <XCircleIcon className="h-3 w-3" />}
            {callResult.ok ? 'ok' : 'error'} · {callResult.durationMs} ms
          </span>
        )}
      </div>
      {callError ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {callError}
        </div>
      ) : toolErrorMessage ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {toolErrorMessage}
        </div>
      ) : callResult ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Request Arguments
            </div>
            <HighlightedJson
            value={callResult.request ?? {}}
            className="mt-1 max-h-48 min-h-[120px] overflow-auto rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
            collapsedByDefault
          />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tool Result {selectedToolName ? `(${selectedToolName})` : ''}
            </div>
            <HighlightedJson
              value={callResult.result}
              className="mt-1 flex-1 overflow-auto rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
              collapsedByDefault
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          Execute a tool call to see the response payload.
        </div>
      )}
    </div>
  );
}

function parseSchema(schema: unknown): ParsedSchema {
  if (!schema || typeof schema !== 'object') {
    return { fields: [], supportsForm: false };
  }
  const obj = schema as Record<string, unknown>;
  const properties = obj.properties as Record<string, any> | undefined;
  const type = (obj.type as string | undefined) ?? (properties ? 'object' : undefined);
  if (type !== 'object' || !properties) {
    return { fields: [], supportsForm: false };
  }
  const required = Array.isArray(obj.required) ? (obj.required as string[]) : [];
  const fields: SchemaField[] = [];
  for (const [name, descriptor] of Object.entries(properties)) {
    if (!descriptor || typeof descriptor !== 'object') {
      return { fields: [], supportsForm: false };
    }
    const fieldType = (descriptor.type as string | undefined) ?? 'string';
    if (['string', 'number', 'integer', 'boolean'].includes(fieldType)) {
      const description =
        typeof (descriptor as Record<string, unknown>).description === 'string'
          ? ((descriptor as Record<string, unknown>).description as string)
          : undefined;
      const field: SchemaField = {
        name,
        type: fieldType as PrimitiveFieldType,
        required: required.includes(name),
      };
      if (description !== undefined) {
        field.description = description;
      }
      if (Object.prototype.hasOwnProperty.call(descriptor, 'default')) {
        field.defaultValue = (descriptor as Record<string, unknown>).default;
      }
      fields.push(field);
      continue;
    }
    if (fieldType === 'array') {
      const items = descriptor.items as Record<string, unknown> | undefined;
      const itemType = items && typeof items === 'object' ? (items.type as string | undefined) : undefined;
      if (!itemType || !['string', 'number', 'integer', 'boolean'].includes(itemType)) {
        return { fields: [], supportsForm: false };
      }
      const description =
        typeof (descriptor as Record<string, unknown>).description === 'string'
          ? ((descriptor as Record<string, unknown>).description as string)
          : undefined;
      const field: SchemaField = {
        name,
        type: 'array',
        itemType: itemType as PrimitiveFieldType,
        required: required.includes(name),
      };
      if (description !== undefined) {
        field.description = description;
      }
      if (Object.prototype.hasOwnProperty.call(descriptor, 'default')) {
        field.defaultValue = (descriptor as Record<string, unknown>).default;
      }
      fields.push(field);
      continue;
    }
    return { fields: [], supportsForm: false };
  }
  return { fields, supportsForm: true };
}

function ToolRequestForm({
  tool,
  disabled,
  loading,
  onSubmit,
}: {
  tool: Tool;
  disabled: boolean;
  loading: boolean;
  onSubmit: (payload?: Record<string, unknown>) => Promise<void>;
}) {
  const parsed = useMemo(() => parseSchema(tool.input_schema ?? null), [tool.input_schema]);
  const { fields, supportsForm } = parsed;
  const [mode, setMode] = useState<'form' | 'json'>(supportsForm ? 'form' : 'json');
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!tool) {
      setMode('json');
      return;
    }
    setMode(supportsForm ? 'form' : 'json');
  }, [tool.name, supportsForm]);

  useEffect(() => {
    const defaults: Record<string, any> = {};
    fields.forEach(field => {
      if (field.defaultValue !== undefined) {
        defaults[field.name] = field.defaultValue;
        return;
      }
      if (field.type === 'boolean') {
        defaults[field.name] = false;
      } else if (field.type === 'array') {
        defaults[field.name] = [];
      } else {
        defaults[field.name] = '';
      }
    });
    setFormState(defaults);
    setFormErrors({});
    setJsonError(null);
    setJsonInput(JSON.stringify(defaults, null, 2));
  }, [tool.name, fields]);

  const syncJsonFromForm = () => {
    const { payload } = preparePayload(fields, formState, false);
    setJsonInput(JSON.stringify(payload, null, 2));
  };

  const handleModeToggle = (checked: boolean) => {
    if (!supportsForm) return;
    if (!checked) {
      syncJsonFromForm();
      setMode('json');
    } else {
      setMode('form');
    }
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleArrayItemChange = (name: string, index: number, value: any) => {
    setFormState(prev => {
      const next = Array.isArray(prev[name]) ? [...prev[name]] : [];
      next[index] = value;
      return { ...prev, [name]: next };
    });
  };

  const handleAddArrayItem = (field: SchemaField) => {
    setFormState(prev => {
      const next = Array.isArray(prev[field.name]) ? [...prev[field.name]] : [];
      if (field.itemType === 'boolean') {
        next.push(false);
      } else {
        next.push('');
      }
      return { ...prev, [field.name]: next };
    });
  };

  const handleRemoveArrayItem = (fieldName: string, index: number) => {
    setFormState(prev => {
      const next = Array.isArray(prev[fieldName]) ? [...prev[fieldName]] : [];
      next.splice(index, 1);
      return { ...prev, [fieldName]: next };
    });
  };

  const submitForm = async () => {
    const { payload, errors } = preparePayload(fields, formState, true);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    await onSubmit(Object.keys(payload).length > 0 ? payload : undefined);
  };

  const submitJson = async () => {
    setJsonError(null);
    if (!jsonInput.trim()) {
      await onSubmit(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed !== null && typeof parsed !== 'object') {
        setJsonError('JSON payload must be an object');
        return;
      }
      await onSubmit(parsed && Object.keys(parsed).length > 0 ? parsed : undefined);
    } catch {
      setJsonError('Invalid JSON payload');
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      {supportsForm && (
        <div className="flex justify-end">
          <ToggleSwitch
            checked={mode === 'form'}
            onChange={handleModeToggle}
            disabled={disabled}
            size="sm"
            label={mode === 'form' ? 'Form mode' : 'JSON mode'}
            description={mode === 'form' ? 'Use structured inputs' : 'Edit raw JSON'}
          />
        </div>
      )}

      {mode === 'json' ? (
        <div className="flex flex-1 flex-col gap-2">
          <textarea
            value={jsonInput}
            onChange={event => setJsonInput(event.target.value)}
            className="min-h-[200px] flex-1 rounded-md border border-gray-300 bg-white p-3 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            spellCheck={false}
            disabled={disabled || loading}
          />
          {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
          <div className="mt-auto flex items-center justify-end gap-2">
            <LoadingButton
              onClick={submitJson}
              loading={loading}
              disabled={disabled}
              className="px-3 py-1.5"
            >
              Call Tool
            </LoadingButton>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-1 flex-col gap-3"
          onSubmit={event => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {fields.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                This tool does not declare any arguments.
              </div>
            ) : (
              fields.map(field => {
                const errorMessage = formErrors[field.name];
                return (
                  <FieldInput
                    key={field.name}
                    field={field}
                    value={formState[field.name]}
                    onChange={handleFieldChange}
                    onArrayChange={handleArrayItemChange}
                    onArrayAdd={handleAddArrayItem}
                    onArrayRemove={handleRemoveArrayItem}
                    disabled={disabled || loading}
                    {...(errorMessage ? { error: errorMessage } : {})}
                  />
                );
              })
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => {
                const defaults: Record<string, any> = {};
                fields.forEach(field => {
                  if (field.defaultValue !== undefined) {
                    defaults[field.name] = field.defaultValue;
                  } else if (field.type === 'boolean') {
                    defaults[field.name] = false;
                  } else if (field.type === 'array') {
                    defaults[field.name] = [];
                  } else {
                    defaults[field.name] = '';
                  }
                });
                setFormState(defaults);
                setFormErrors({});
                setJsonError(null);
                setJsonInput(JSON.stringify(defaults, null, 2));
              }}
              disabled={disabled || loading}
            >
              Reset
            </button>
            <LoadingButton
              type="submit"
              loading={loading}
              disabled={disabled}
              className="px-3 py-1.5"
            >
              Call Tool
            </LoadingButton>
          </div>
        </form>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  onArrayChange,
  onArrayAdd,
  onArrayRemove,
  error,
  disabled,
}: {
  field: SchemaField;
  value: any;
  onChange: (name: string, value: any) => void;
  onArrayChange: (name: string, index: number, value: any) => void;
  onArrayAdd: (field: SchemaField) => void;
  onArrayRemove: (name: string, index: number) => void;
  error?: string;
  disabled: boolean;
}) {
  if (field.type === 'array') {
    const items: any[] = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {field.name}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </label>
          <button
            type="button"
            onClick={() => onArrayAdd(field)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            disabled={disabled}
          >
            Add value
          </button>
        </div>
        {field.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
        )}
        <div className="flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No values</p>
          ) : (
            items.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <PrimitiveInput
                  type={field.itemType!}
                  value={entry}
                  onChange={val => onArrayChange(field.name, index, val)}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => onArrayRemove(field.name, index)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  const inputId = `field-${field.name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700 dark:text-gray-200">
        {field.name}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {field.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
      )}
      <PrimitiveInput
        type={field.type as PrimitiveFieldType}
        value={value}
        onChange={val => onChange(field.name, val)}
        disabled={disabled}
        id={inputId}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

function PrimitiveInput({
  type,
  value,
  onChange,
  disabled,
  id,
}: {
  type: PrimitiveFieldType;
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
  id?: string;
}) {
  if (type === 'boolean') {
    return (
      <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={event => onChange(event.target.checked)}
          disabled={disabled}
          id={id}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>{value ? 'true' : 'false'}</span>
      </label>
    );
  }

  return (
    <input
      type={type === 'string' ? 'text' : 'number'}
      value={value ?? ''}
      onChange={event => onChange(event.target.value)}
      step={type === 'integer' ? '1' : undefined}
      id={id}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      disabled={disabled}
    />
  );
}

function preparePayload(
  fields: SchemaField[],
  formState: Record<string, any>,
  strict: boolean,
): { payload: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};
  fields.forEach(field => {
    const raw = formState[field.name];
    if (field.type === 'array') {
      const arr = Array.isArray(raw) ? raw : [];
      if (field.required && arr.length === 0 && strict) {
        errors[field.name] = 'At least one value is required.';
        return;
      }
      const converted: unknown[] = [];
      arr.forEach(item => {
        const result = coercePrimitive(field.itemType!, item);
        if (!result.valid) {
          if (strict) {
            errors[field.name] = result.message ?? 'Invalid value';
          }
        } else if (result.value !== undefined) {
          converted.push(result.value);
        }
        if (!strict && result.value === undefined) {
          // skip silently
        }
        if (strict && errors[field.name]) return;
      });
      if (converted.length > 0) {
        payload[field.name] = converted;
      } else if (field.required && strict && !errors[field.name]) {
        errors[field.name] = 'At least one valid value is required.';
      }
      return;
    }

    if (raw === '' || raw === undefined || raw === null) {
      if (field.required && strict) {
        errors[field.name] = 'This field is required.';
      }
      return;
    }
    const result = coercePrimitive(field.type as PrimitiveFieldType, raw);
    if (!result.valid) {
      if (strict) {
        errors[field.name] = result.message ?? 'Invalid value';
      }
      return;
    }
    if (result.value !== undefined) {
      payload[field.name] = result.value;
    }
  });
  return { payload, errors };
}

function coercePrimitive(type: PrimitiveFieldType, value: any): { valid: boolean; value?: unknown; message?: string } {
  if (type === 'string') {
    return { valid: true, value: String(value) };
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return { valid: true, value };
    if (value === 'true') return { valid: true, value: true };
    if (value === 'false') return { valid: true, value: false };
    return { valid: false, message: 'Expected boolean value.' };
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { valid: false, message: 'Expected a numeric value.' };
  }
  if (type === 'integer' && !Number.isInteger(num)) {
    return { valid: false, message: 'Expected an integer value.' };
  }
  return { valid: true, value: num };
}
