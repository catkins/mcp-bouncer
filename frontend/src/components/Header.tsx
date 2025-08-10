import { StatusIndicator } from './StatusIndicator'
import { SunIcon, MoonIcon, Cog6ToothIcon, GlobeAltIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'

interface HeaderProps {
  isActive: boolean | null
  toggleTheme: () => void
  theme: 'light' | 'dark'
  onOpenConfig: () => void
  mcpUrl: string
}

export function Header({ isActive, toggleTheme, theme, onOpenConfig, mcpUrl }: HeaderProps) {
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl)
    } catch (error) {
      console.error('Failed to copy URL:', error)
    }
  }
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-gray-50/90 dark:bg-gray-800/60 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3 ml-20">
          <img src="/appicon.png" alt="App Icon" className="h-6 w-6" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">MCP Bouncer</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 dark:bg-gray-800 rounded-lg">
            <GlobeAltIcon className={`h-4 w-4 ${isActive ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
            <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
              {mcpUrl}
            </span>
            <button
              onClick={handleCopyUrl}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-colors"
              aria-label="Copy MCP URL"
            >
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onOpenConfig}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Open config directory"
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <SunIcon className="h-4 w-4" />
            ) : (
              <MoonIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}
