import {
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import type { SocketBridgeInfo } from '../tauri/bridge';

interface HeaderProps {
  isActive: boolean | null;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  onOpenSettings: () => void;
  mcpUrl: string;
  socketBridgePath: SocketBridgeInfo | null;
}

export function Header({
  isActive,
  toggleTheme,
  theme,
  onOpenSettings,
  mcpUrl,
  socketBridgePath,
}: HeaderProps) {
  const usingBridge = Boolean(socketBridgePath);
  const primaryValue = usingBridge ? socketBridgePath?.path ?? '' : mcpUrl;
  const primaryCopyLabel = usingBridge ? 'Copy bridge path' : 'Copy MCP URL';
  const primaryCopyDisabled = usingBridge ? !socketBridgePath?.exists : false;
  const PrimaryIcon = usingBridge ? CommandLineIcon : GlobeAltIcon;

  const handleCopyEndpoint = async () => {
    if (!primaryValue) return;
    try {
      await navigator.clipboard.writeText(primaryValue);
    } catch (error) {
      console.error('Failed to copy endpoint:', error);
    }
  };
  return (
    <header className="fixed top-0 left-0 right-0 z-40 border-b border-surface-200 bg-surface-100/95 backdrop-blur-md transition-colors dark:border-surface-800/60 dark:bg-surface-900/70">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <img src="/appicon.png" alt="App Icon" className="h-10 w-10 drop-shadow-md" />
          <h1 className="text-lg font-semibold text-surface-900 dark:text-white">MCP Bouncer</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-100 px-3 py-1.5 dark:bg-surface-800">
            <PrimaryIcon
              className={`h-4 w-4 ${isActive ? 'text-green-500 dark:text-green-400' : 'text-surface-500 dark:text-surface-400'}`}
            />
            <span
              className="max-w-xs truncate text-sm font-mono text-surface-700 dark:text-surface-200 sm:max-w-md"
              title={primaryValue}
              aria-label={primaryValue}
              aria-description={
                usingBridge
                  ? 'Path to the Unix stdio bridge helper binary'
                  : 'URL for the MCP proxy endpoint'
              }
            >
              {primaryValue}
            </span>
            <button
              onClick={handleCopyEndpoint}
              disabled={primaryCopyDisabled}
              className={`rounded p-1 transition-colors ${primaryCopyDisabled ? 'cursor-not-allowed text-surface-400 dark:text-surface-600' : 'text-surface-500 hover:bg-surface-200 hover:text-surface-800 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white'}`}
              aria-label={primaryCopyLabel}
              title={usingBridge ? 'Copy path to stdio bridge' : 'Copy MCP URL'}
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            </button>
            {usingBridge && !socketBridgePath?.exists ? (
              <span className="text-xs text-amber-500 dark:text-amber-400">build helper to enable</span>
            ) : null}
          </div>
          <button
            onClick={onOpenSettings}
            className="rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-200 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white"
            aria-label="Open settings"
            title="Open settings"
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-200 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white"
            aria-label="Toggle theme"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
