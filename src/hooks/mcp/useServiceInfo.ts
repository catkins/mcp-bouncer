import { useCallback, useState } from 'react';
import { MCPService, MiscService, type SocketBridgeInfo } from '../../tauri/bridge';

export function useServiceInfo() {
  const [mcpUrl, setMcpUrl] = useState('');
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [socketBridgePath, setSocketBridgePath] = useState<SocketBridgeInfo | null>(null);

  const loadMcpUrl = useCallback(async () => {
    try {
      setLoadingUrl(true);
      const url = await MCPService.ListenAddr();
      setMcpUrl(url);
    } catch (error) {
      console.error('Failed to load MCP URL:', error);
    } finally {
      setLoadingUrl(false);
    }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      setLoadingActive(true);
      const active = await MCPService.IsActive();
      setIsActive(active);
    } catch (error) {
      console.error('Failed to load service status:', error);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const loadSocketBridgePath = useCallback(async () => {
    try {
      const info = await MiscService.GetSocketBridgePath();
      setSocketBridgePath(info ?? null);
    } catch (error) {
      console.error('Failed to load socket bridge path:', error);
    }
  }, []);

  return {
    mcpUrl,
    isActive,
    socketBridgePath,
    loadMcpUrl,
    loadActive,
    loadSocketBridgePath,
    loadingUrl,
    loadingActive,
  } as const;
}
