interface FormInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}

export function FormInput({
  id,
  label,
  value,
  onChange,
  error,
  required = false,
  placeholder,
  type = 'text',
  disabled = false,
}: FormInputProps) {
  const getInputClassName = () => {
    const baseClasses =
      'w-full px-2 py-1.5 border rounded-md bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-white focus:ring-2 focus:border-transparent text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-surface-100/70 dark:disabled:bg-surface-800/60';
    const errorClasses = 'border-red-500 focus:ring-red-500';
    const normalClasses =
      'border-surface-300 dark:border-surface-600 focus:ring-brand-400 dark:focus:ring-brand-500';

    return `${baseClasses} ${error ? errorClasses : normalClasses}`;
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1"
      >
        {label} {required && '*'}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={getInputClassName()}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
