import { useCallback, useState } from 'react';
import type { MCPServerConfig } from '../../tauri/bridge';
import { MCPService } from '../../tauri/bridge';

export function useServersState() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      const list = await MCPService.List();
      setServers(list);
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { servers, setServers, loadServers, loading, loaded } as const;
}
