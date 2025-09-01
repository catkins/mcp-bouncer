interface FormInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
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
}: FormInputProps) {
  const getInputClassName = () => {
    const baseClasses =
      'w-full px-2 py-1.5 border rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:border-transparent text-sm';
    const errorClasses = 'border-red-500 focus:ring-red-500';
    const normalClasses =
      'border-gray-300 dark:border-gray-700 focus:ring-purple-500 dark:focus:ring-purple-400';

    return `${baseClasses} ${error ? errorClasses : normalClasses}`;
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
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
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

