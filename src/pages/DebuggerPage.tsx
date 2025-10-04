import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MCPServerConfig,
  ClientStatus,
  Tool,
  DebugCallToolResponse,
} from '../tauri/bridge';
import { MCPService } from '../tauri/bridge';
import { ToolListPanel, RequestPanel, ResponsePanel } from '../components/debugger';
import type { CallOutcome, DebuggerServerOption } from '../components/debugger';
import {
  ArrowPathIcon,
  BugAntIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

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
      const args = payload ?? {};
      const response: DebugCallToolResponse = await MCPService.DebugCallTool(
        selectedServer,
        selectedTool.name,
        args,
      );
      const outcome: CallOutcome = {
        timestamp: Date.now(),
        ok: response.ok,
        durationMs: Math.round(response.duration_ms ?? 0),
        result: response.result,
        request: response.request_arguments ?? args,
      };
      setCallResult(outcome);
      setCallError(null);
    } catch (error) {
      console.error('Tool call failed', error);
      setCallResult(null);
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

  const serverOptions: DebuggerServerOption[] = eligibleServers.map(name => ({
    name,
    description: serverLookup.get(name)?.description ?? '',
  }));

  return (
    <div className="flex min-h-[calc(100vh-220px)] flex-col gap-4">
      <div className="grid flex-1 min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_1fr] lg:items-start">
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
          serverOptions={serverOptions}
          selectedServer={selectedServer}
          onSelectServer={onSelectServer}
          serverEligible={serverEligible}
          {...(selectedStatus ? { serverStatus: selectedStatus } : {})}
        />
        {!selectedServer || !serverEligible ? (
          <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white/70 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
            <div className="flex max-w-md flex-col items-center gap-2 text-center">
              <DocumentTextIcon className="h-8 w-8 text-blue-500" />
              <p className="font-medium">
                {selectedServer
                  ? 'Debugger is available only for connected servers with tools.'
                  : 'Select a server to begin debugging its tools using the server picker.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-rows-[auto_minmax(240px,1fr)]">
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
        )}
      </div>
    </div>
  );
}
