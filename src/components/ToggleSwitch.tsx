interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  description?: string;
  ariaLabel?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  label,
  description,
  ariaLabel,
}: ToggleSwitchProps) {
  const sizeClasses = {
    sm: 'w-8 h-4',
    md: 'w-10 h-5',
    lg: 'w-12 h-6',
  };

  const thumbSizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative inline-flex items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-surface-50 dark:focus:ring-offset-surface-900
          ${sizeClasses[size]}
          ${
            checked
              ? 'bg-brand-500 shadow-md dark:bg-brand-600'
              : 'bg-surface-200 dark:bg-surface-600'
          }
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:shadow-md'
          }
          ${disabled && checked ? 'animate-pulse' : ''}
        `}
        aria-label={ariaLabel ?? label ?? 'Toggle switch'}
      >
        <span
          className={`
            inline-block rounded-full bg-white shadow transform transition-all duration-300 ease-in-out
            ${thumbSizeClasses[size]}
            ${checked ? 'translate-x-4' : 'translate-x-0.5'}
            ${disabled ? 'opacity-75' : ''}
          `}
        />
        {/* Loading indicator when disabled */}
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-white/20 rounded-full animate-pulse" />
          </div>
        )}
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span
              className={`font-medium ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'} text-surface-800 dark:text-white transition-colors duration-200 ${
                disabled ? 'text-surface-400 dark:text-surface-500' : ''
              }`}
            >
              {label}
            </span>
          )}
          {description && (
            <span
              className={`${size === 'sm' ? 'text-xs' : 'text-sm'} text-surface-600 dark:text-surface-400 transition-colors duration-200 ${
                disabled ? 'text-surface-400 dark:text-surface-600' : ''
              }`}
            >
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
