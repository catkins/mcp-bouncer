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
      'appearance-none w-full rounded-lg border bg-surface-50/95 dark:bg-surface-800/80 text-surface-900 dark:text-surface-100 shadow-sm transition-colors duration-200',
      'focus:outline-none focus:ring-2 focus:ring-brand-300/60 focus:border-brand-400/40 dark:focus:ring-brand-500/60 dark:focus:border-brand-500/50',
      'hover:border-surface-400 dark:hover:border-surface-500',
      'border-surface-300/90 dark:border-surface-600/80',
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
              'text-xs font-medium uppercase tracking-wide text-surface-600 dark:text-surface-300',
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
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 dark:text-surface-500" />
        </div>
        {error ? (
          <p className="text-xs font-medium text-red-500">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-surface-500 dark:text-surface-400">{helperText}</p>
        ) : null}
      </div>
    );
  },
);

DropdownSelect.displayName = 'DropdownSelect';
