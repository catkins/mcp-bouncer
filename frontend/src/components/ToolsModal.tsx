import { useState, useEffect } from 'react';
import { WrenchScrewdriverIcon, PowerIcon } from '@heroicons/react/24/outline';
import { MCPService } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp';
import { ToggleSwitch } from './ToggleSwitch';
import { LoadingButton } from './LoadingButton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface Tool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface ToolsModalProps {
  serverName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ToolsModal({ serverName, isOpen, onClose }: ToolsModalProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [toolStates, setToolStates] = useState<{ [key: string]: boolean }>({});
  const [toggleLoading, setToggleLoading] = useState<{ [key: string]: boolean }>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (isOpen && serverName) {
      loadTools();
    }
  }, [isOpen, serverName]);

  const loadTools = async () => {
    try {
      setLoading(true);
      setError('');
      const toolsData = await MCPService.GetClientTools(serverName);
      setTools(toolsData as Tool[]);

      // Initialize all tools as enabled by default
      const initialStates: { [key: string]: boolean } = {};
      toolsData.forEach((tool: any) => {
        initialStates[tool.name] = true;
      });
      setToolStates(initialStates);
    } catch (err) {
      console.error('Failed to load tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tools');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTool = async (toolName: string, enabled: boolean) => {
    try {
      setToggleLoading(prev => ({ ...prev, [toolName]: true }));
      await MCPService.ToggleTool(serverName, toolName, enabled);
      setToolStates(prev => ({ ...prev, [toolName]: enabled }));
    } catch (err) {
      console.error('Failed to toggle tool:', err);
      // Revert the toggle state on error
      setToolStates(prev => ({ ...prev, [toolName]: !enabled }));
      setError(err instanceof Error ? err.message : 'Failed to toggle tool');
    } finally {
      setToggleLoading(prev => ({ ...prev, [toolName]: false }));
    }
  };

  const handleBulkToggle = async () => {
    const enabledCount = Object.values(toolStates).filter(Boolean).length;
    const totalCount = tools.length;
    const shouldEnable = enabledCount < totalCount / 2; // Enable if less than half are enabled

    try {
      setBulkLoading(true);
      setError('');

      // Toggle all tools to the target state
      const promises = tools.map(tool =>
        MCPService.ToggleTool(serverName, tool.name, shouldEnable),
      );

      await Promise.all(promises);

      // Update all tool states
      const newStates: { [key: string]: boolean } = {};
      tools.forEach(tool => {
        newStates[tool.name] = shouldEnable;
      });
      setToolStates(newStates);
    } catch (err) {
      console.error('Failed to bulk toggle tools:', err);
      setError(err instanceof Error ? err.message : 'Failed to bulk toggle tools');
    } finally {
      setBulkLoading(false);
    }
  };

  // Calculate bulk action state
  const enabledCount = Object.values(toolStates).filter(Boolean).length;
  const totalCount = tools.length;
  const shouldEnable = enabledCount < totalCount / 2;
  const bulkActionText = shouldEnable ? 'Enable All' : 'Disable All';
  const bulkActionDescription = shouldEnable
    ? `Enable all ${totalCount} tools`
    : `Disable all ${totalCount} tools`;

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }

    return undefined;
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Tools - {serverName}
            <span className="text-sm text-gray-500 dark:text-gray-400 font-normal">
              ({tools.length} tools)
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : tools.length === 0 ? (
            <div className="text-center py-8">
              <WrenchScrewdriverIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tools available for this server</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Toggle individual tools on or off. Disabled tools will not be available to MCP
                  clients.
                </p>

                {/* Bulk Action Button */}
                <Button
                  onClick={handleBulkToggle}
                  disabled={bulkLoading}
                  variant={shouldEnable ? 'default' : 'secondary'}
                  size="sm"
                  className="gap-1.5"
                >
                  {bulkLoading ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  ) : (
                    <PowerIcon className="w-3 h-3" />
                  )}
                  <span>{bulkActionText}</span>
                </Button>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center w-20">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tools.map((tool) => (
                      <TableRow
                        key={tool.name}
                        className={`${
                          toggleLoading[tool.name] ? 'opacity-75' : ''
                        }`}
                      >
                        <TableCell>
                          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                            {tool.name}
                          </code>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-foreground line-clamp-2">
                            {tool.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center">
                            <ToggleSwitch
                              checked={toolStates[tool.name] ?? true}
                              onChange={enabled => handleToggleTool(tool.name, enabled)}
                              disabled={toggleLoading[tool.name] || loading || bulkLoading}
                              size="sm"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/50">
          <div className="text-xs text-muted-foreground">
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
          <LoadingButton onClick={onClose} variant="secondary" size="sm">
            Close
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
