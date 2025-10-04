import { forwardRef, useId } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'> {
  label?: string;
  helperText?: string;
  error?: string;
  options: DropdownOption[];
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  selectClassName?: string;
}

export const DropdownSelect = forwardRef<HTMLSelectElement, DropdownSelectProps>(
  (
    {
      label,
      helperText,
      error,
      options,
      id,
      size = 'md',
      fullWidth = false,
      className,
      selectClassName,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const generatedId = useId();
    const controlId = id ?? generatedId;

    const baseSelectClasses = clsx(
      'appearance-none w-full rounded-lg border bg-white/95 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100 shadow-sm transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 dark:focus:ring-purple-400/60 dark:focus:border-purple-400/60',
      'hover:border-gray-400 dark:hover:border-gray-500',
      'border-gray-300/90 dark:border-gray-700/80',
      disabled && 'cursor-not-allowed opacity-60',
      size === 'sm' ? 'h-9 px-3 pr-9 text-sm' : 'h-10 px-3 pr-9 text-sm',
      error && 'border-red-400 focus:border-red-500 focus:ring-red-400/40',
      selectClassName,
    );

    return (
      <div className={clsx('flex flex-col gap-1', fullWidth ? 'w-full' : 'w-48', className)}>
        {label ? (
          <label
            htmlFor={controlId}
            className={clsx(
              'text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300',
              disabled && 'opacity-70',
            )}
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            id={controlId}
            ref={ref}
            disabled={disabled}
            className={baseSelectClasses}
            {...rest}
          >
            {options.map(option => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        </div>
        {error ? (
          <p className="text-xs font-medium text-red-500">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{helperText}</p>
        ) : null}
      </div>
    );
  },
);

DropdownSelect.displayName = 'DropdownSelect';

