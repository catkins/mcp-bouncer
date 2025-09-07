import { useCallback, useState } from 'react';
import type { MCPServerConfig } from '../../tauri/bridge';
import { MCPService } from '../../tauri/bridge';

export function useServersState() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);

  const loadServers = useCallback(async () => {
    try {
      const list = await MCPService.List();
      setServers(list);
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  }, []);

  return { servers, setServers, loadServers } as const;
}

