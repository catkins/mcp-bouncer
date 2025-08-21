import { Switch } from '@/components/ui/switch';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
  description?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  label,
  description,
}: ToggleSwitchProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        size={size}
        aria-label={label || 'Toggle switch'}
        className={`${
          disabled && checked ? 'animate-pulse opacity-75' : ''
        }`}
      />
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span
              className={`font-medium ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-base'} text-gray-900 dark:text-white transition-colors duration-200 ${
                disabled ? 'opacity-60' : ''
              }`}
            >
              {label}
            </span>
          )}
          {description && (
            <span
              className={`${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 transition-colors duration-200 ${
                disabled ? 'opacity-60' : ''
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
