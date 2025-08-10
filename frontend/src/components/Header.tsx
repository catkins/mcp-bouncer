import { StatusIndicator } from './StatusIndicator'
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'

interface HeaderProps {
  isActive: boolean | null
  toggleTheme: () => void
  theme: 'light' | 'dark'
}

export function Header({ isActive, toggleTheme, theme }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3 ml-20">
          <img src="/appicon.png" alt="App Icon" className="h-6 w-6" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">MCP Bouncer</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <StatusIndicator isActive={isActive} />
          <button
            onClick={toggleTheme}
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
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
