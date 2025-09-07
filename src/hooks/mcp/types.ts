import type { Settings } from '../../tauri/bridge';

export interface LoadingStates {
  addServer: boolean;
  updateServer: boolean;
  removeServer: boolean;
  general: boolean;
  restartServer: { [key: string]: boolean };
  toggleServer: { [key: string]: boolean };
}

export interface ErrorStates {
  addServer?: string;
  updateServer?: string;
  removeServer?: string;
  general?: string;
  toggleServer?: { [key: string]: string | undefined };
}

// Historical aggregate type removed; prefer using dedicated hooks + LoadingStates/ErrorStates
