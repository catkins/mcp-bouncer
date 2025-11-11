import { useCallback, useState } from 'react';
import type { Settings } from '../../tauri/bridge';
import { SettingsService } from '../../tauri/bridge';

export function useSettingsState() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsPath, setSettingsPath] = useState<string>('');

  const loadSettings = useCallback(async () => {
    try {
      const detail = await SettingsService.GetSettings();
      setSettings(detail.settings);
      setSettingsPath(detail.path);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [setSettings, setSettingsPath]);

  const openConfigDirectory = useCallback(async () => {
    try {
      await SettingsService.OpenConfigDirectory();
    } catch (error) {
      console.error('Failed to open config directory:', error);
    }
  }, []);

  const updateSettings = useCallback(async (next: Settings) => {
    try {
      await SettingsService.UpdateSettings(next);
      setSettings(next);
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }, [setSettings]);

  return {
    settings,
    setSettings,
    loadSettings,
    openConfigDirectory,
    settingsPath,
    updateSettings,
  } as const;
}
