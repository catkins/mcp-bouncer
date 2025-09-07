import { useCallback, useState } from 'react';
import type { Settings } from '../../tauri/bridge';
import { SettingsService } from '../../tauri/bridge';

export function useSettingsState() {
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const st = await SettingsService.GetSettings();
      setSettings(st);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  const openConfigDirectory = useCallback(async () => {
    try {
      await SettingsService.OpenConfigDirectory();
    } catch (error) {
      console.error('Failed to open config directory:', error);
    }
  }, []);

  return { settings, setSettings, loadSettings, openConfigDirectory } as const;
}

