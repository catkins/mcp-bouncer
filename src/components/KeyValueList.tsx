import { LoadingButton } from './LoadingButton';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface KeyValueListProps {
  label: string;
  items: Record<string, string>;
  keyPlaceholder: string;
  valuePlaceholder: string;
  onAdd: () => void;
  onUpdate: (index: number, oldKey: string, newKey: string, value: string) => void;
  onRemove: (key: string) => void;
  ariaLabelBase: string;
}

export function KeyValueList({
  label,
  items,
  keyPlaceholder,
  valuePlaceholder,
  onAdd,
  onUpdate,
  onRemove,
  ariaLabelBase,
}: KeyValueListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <LoadingButton
          type="button"
          onClick={onAdd}
          variant="secondary"
          size="sm"
          className="text-xs px-1.5 py-0.5 h-5"
          ariaLabel={`Add ${label}`}
        >
          <PlusIcon className="h-2.5 w-2.5 inline-block" />
          Add
        </LoadingButton>
      </div>
      <div className="space-y-1.5">
        {Object.entries(items || {}).map(([key, value], index) => (
          <div key={`kv-${index}`} className="flex items-center gap-1.5">
            <input
              type="text"
              value={key}
              onChange={e => onUpdate(index, key, e.target.value, value)}
              className="w-1/3 px-2 py-1.5 border border-surface-300 dark:border-surface-600 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-white focus:ring-2 focus:ring-brand-400 dark:focus:ring-brand-500 focus:border-transparent text-sm"
              placeholder={keyPlaceholder}
              aria-label={`${ariaLabelBase} key ${index + 1}`}
            />
            <input
              type="text"
              value={value}
              onChange={e => onUpdate(index, key, key, e.target.value)}
              className="flex-1 px-2 py-1.5 border border-surface-300 dark:border-surface-600 rounded-md bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-white focus:ring-2 focus:ring-brand-400 dark:focus:ring-brand-500 focus:border-transparent text-sm"
              placeholder={valuePlaceholder}
              aria-label={`${ariaLabelBase} value ${index + 1}`}
            />
            <LoadingButton
              type="button"
              onClick={() => onRemove(key)}
              variant="danger"
              size="sm"
              className="p-1.5"
              ariaLabel={`Remove ${ariaLabelBase} ${key}`}
            >
              <TrashIcon className="h-3 w-3" />
            </LoadingButton>
          </div>
        ))}
      </div>
    </div>
  );
}
