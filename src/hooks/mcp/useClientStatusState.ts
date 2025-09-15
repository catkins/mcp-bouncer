import { useCallback, useState } from 'react';
import type { ClientStatus } from '../../tauri/bridge';
import { MCPService } from '../../tauri/bridge';

export function useClientStatusState() {
  const [clientStatus, setClientStatus] = useState<Record<string, ClientStatus>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadClientStatus = useCallback(async () => {
    try {
      setLoading(true);
      const st = await MCPService.GetClientStatus();
      setClientStatus(st);
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load client status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { clientStatus, setClientStatus, loadClientStatus, loading, loaded } as const;
}
