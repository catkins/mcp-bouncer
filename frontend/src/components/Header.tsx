import { SunIcon, MoonIcon } from '@heroicons/react/24/outline'
import { StatusIndicator } from './StatusIndicator'

interface HeaderProps {
  isActive: boolean | null
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function Header({ isActive, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 z-40 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 ml-20">
        <div className="flex items-center gap-2">
          <img 
            src="/appicon.png" 
            alt="MCP Bouncer" 
            className="h-6 w-6 rounded-lg shadow-sm"
          />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
            MCP Bouncer
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <MoonIcon className="h-4 w-4" />
            ) : (
              <SunIcon className="h-4 w-4" />
            )}
          </button>
          <StatusIndicator isActive={isActive} />
        </div>
      </div>
    </header>
  )
}
