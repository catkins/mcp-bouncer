import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface LoadingButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  children: ReactNode;
  onClick?: () => void | Promise<void>;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export function LoadingButton({
  children,
  onClick,
  loading = false,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  disabled = false,
  ariaLabel,
  ...rest
}: LoadingButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-50 dark:focus:ring-offset-surface-900 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden';

  const variantClasses = {
    primary:
      'bg-brand-500 hover:bg-brand-400 focus:ring-brand-300 text-white shadow-sm hover:shadow-md',
    secondary:
      'bg-surface-200 dark:bg-surface-700 text-surface-800 dark:text-surface-100 hover:bg-surface-300 dark:hover:bg-surface-600 focus:ring-surface-300 dark:focus:ring-surface-500 shadow-sm',
    danger:
      'bg-red-500 hover:bg-red-600 focus:ring-red-400 text-white shadow-sm hover:shadow-md',
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-sm',
  };

  const handleClick = async () => {
    if (loading || disabled) return;
    if (onClick) {
      try {
        await onClick();
      } catch (error) {
        console.error('Button action failed:', error);
      }
    }
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={loading || disabled}
      aria-label={ariaLabel}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${
        loading ? 'animate-pulse' : ''
      }`}
      {...rest}
    >
      <span className={`transition-all duration-200 inline-flex items-center gap-1.5 ${loading ? 'opacity-75' : ''}`}>
        {loading && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </span>
      {/* Loading overlay */}
      {loading && <div className="absolute inset-0 bg-black/10 rounded-lg animate-pulse" />}
    </button>
  );
}
