import { useCallback, useState } from 'react';
import type { ClientStatus } from '../../tauri/bridge';
import { MCPService } from '../../tauri/bridge';

export function useClientStatusState() {
  const [clientStatus, setClientStatus] = useState<Record<string, ClientStatus>>({});

  const loadClientStatus = useCallback(async () => {
    try {
      const st = await MCPService.GetClientStatus();
      setClientStatus(st);
    } catch (error) {
      console.error('Failed to load client status:', error);
    }
  }, []);

  return { clientStatus, setClientStatus, loadClientStatus } as const;
}

