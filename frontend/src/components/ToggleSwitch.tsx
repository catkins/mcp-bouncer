import { ReactNode } from 'react'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
  description?: string
}

export function ToggleSwitch({ 
  checked, 
  onChange, 
  disabled = false, 
  size = 'md',
  className = '',
  label,
  description
}: ToggleSwitchProps) {
  const sizeClasses = {
    sm: 'w-8 h-4',
    md: 'w-10 h-5',
    lg: 'w-12 h-6'
  }

  const thumbSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked)
    }
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${sizeClasses[size]}
          ${checked 
            ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500' 
            : 'bg-gray-300 dark:bg-gray-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
        `}
        aria-label={label || 'Toggle switch'}
      >
        <span
          className={`
            inline-block rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out
            ${thumbSizeClasses[size]}
            ${checked ? 'translate-x-5' : 'translate-x-0.5'}
          `}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className={`font-medium ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'} text-gray-900 dark:text-white`}>
              {label}
            </span>
          )}
          {description && (
            <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
