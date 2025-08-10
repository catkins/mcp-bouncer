import { ReactNode } from 'react'

interface LoadingButtonProps {
  children: ReactNode
  onClick?: () => void | Promise<void>
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  type?: 'button' | 'submit'
}

export function LoadingButton({ 
  children, 
  onClick, 
  loading = false, 
  disabled = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button'
}: LoadingButtonProps) {
  const baseClasses = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
  
  const variantClasses = {
    primary: "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 focus:ring-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 animate-gradient bg-[length:200%_200%]",
    secondary: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500",
    danger: "bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 focus:ring-red-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
  }
  
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-2 text-sm",
    lg: "px-4 py-2.5 text-sm"
  }

  const handleClick = async () => {
    if (loading || disabled) return
    if (onClick) {
      try {
        await onClick()
      } catch (error) {
        console.error('Button action failed:', error)
      }
    }
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={loading || disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading && (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
      )}
      {children}
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer"></div>
      )}
    </button>
  )
}
