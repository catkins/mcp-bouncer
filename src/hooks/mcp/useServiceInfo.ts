import { useCallback, useState } from 'react';
import { MCPService } from '../../tauri/bridge';

export function useServiceInfo() {
  const [mcpUrl, setMcpUrl] = useState('');
  const [isActive, setIsActive] = useState<boolean | null>(null);

  const loadMcpUrl = useCallback(async () => {
    try {
      const url = await MCPService.ListenAddr();
      setMcpUrl(url);
    } catch (error) {
      console.error('Failed to load MCP URL:', error);
    }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      const active = await MCPService.IsActive();
      setIsActive(active);
    } catch (error) {
      console.error('Failed to load service status:', error);
    }
  }, []);

  return { mcpUrl, isActive, loadMcpUrl, loadActive } as const;
}

