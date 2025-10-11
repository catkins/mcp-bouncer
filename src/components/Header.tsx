import {
  SunIcon,
  MoonIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';

interface HeaderProps {
  isActive: boolean | null;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  onOpenConfig: () => void;
  mcpUrl: string;
}

export function Header({ isActive, toggleTheme, theme, onOpenConfig, mcpUrl }: HeaderProps) {
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
    } catch (error) {
      console.error('Failed to copy URL:', error);
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
            <GlobeAltIcon
              className={`h-4 w-4 ${isActive ? 'text-green-500 dark:text-green-400' : 'text-surface-500 dark:text-surface-400'}`}
            />
            <span className="text-sm font-mono text-surface-700 dark:text-surface-200">{mcpUrl}</span>
            <button
              onClick={handleCopyUrl}
              className="rounded p-1 text-surface-500 transition-colors hover:bg-surface-200 hover:text-surface-800 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white"
              aria-label="Copy MCP URL"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onOpenConfig}
            className="rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-200 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white"
            aria-label="Open config directory"
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-surface-600 transition-colors hover:bg-surface-200 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
