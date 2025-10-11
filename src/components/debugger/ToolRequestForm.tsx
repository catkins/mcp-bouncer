import { useEffect, useMemo, useState } from 'react';
import type { Tool } from '../../tauri/bridge';
import { LoadingButton } from '../LoadingButton';
import { ToggleSwitch } from '../ToggleSwitch';
import type { ParsedSchema, PrimitiveFieldType, SchemaField, SchemaEnumValue } from './types';
import { parseSchema, preparePayload, describeFieldType } from './utils';
import { DropdownSelect } from '../DropdownSelect';

interface ToolRequestFormProps {
  tool: Tool;
  disabled: boolean;
  loading: boolean;
  onSubmit: (payload?: Record<string, unknown>) => Promise<void>;
}

export function ToolRequestForm({ tool, disabled, loading, onSubmit }: ToolRequestFormProps) {
  const parsed = useMemo<ParsedSchema>(() => parseSchema(tool.input_schema ?? null), [tool.input_schema]);
  const { fields, supportsForm, declaredNoParams } = parsed;
  const [mode, setMode] = useState<'form' | 'json'>(supportsForm ? 'form' : 'json');
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  useEffect(() => {
    setMode(supportsForm ? 'form' : 'json');
    setShowJsonEditor(false);
  }, [tool.name, supportsForm]);

  useEffect(() => {
    const defaults: Record<string, any> = {};
    fields.forEach(field => {
      if (field.defaultValue !== undefined) {
        defaults[field.name] = field.defaultValue;
        return;
      }
      if (field.type === 'boolean') {
        defaults[field.name] = false;
      } else if (field.type === 'array') {
        defaults[field.name] = [];
      } else {
        defaults[field.name] = '';
      }
    });
    setFormState(defaults);
    setFormErrors({});
    setJsonError(null);
    setJsonInput(JSON.stringify(defaults, null, 2));
  }, [tool.name, fields]);

  const syncJsonFromForm = () => {
    const { payload } = preparePayload(fields, formState, false);
    setJsonInput(JSON.stringify(payload, null, 2));
  };

  const handleModeToggle = (checked: boolean) => {
    if (!supportsForm) return;
    if (!checked) {
      syncJsonFromForm();
      setMode('json');
    } else {
      setMode('form');
    }
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleArrayItemChange = (name: string, index: number, value: any) => {
    setFormState(prev => {
      const next = Array.isArray(prev[name]) ? [...prev[name]] : [];
      next[index] = value;
      return { ...prev, [name]: next };
    });
  };

  const handleAddArrayItem = (field: SchemaField) => {
    setFormState(prev => {
      const next = Array.isArray(prev[field.name]) ? [...prev[field.name]] : [];
      if (field.itemType === 'boolean') {
        next.push(false);
      } else {
        next.push('');
      }
      return { ...prev, [field.name]: next };
    });
  };

  const handleRemoveArrayItem = (fieldName: string, index: number) => {
    setFormState(prev => {
      const next = Array.isArray(prev[fieldName]) ? [...prev[fieldName]] : [];
      next.splice(index, 1);
      return { ...prev, [fieldName]: next };
    });
  };

  const submitForm = async () => {
    const { payload, errors } = preparePayload(fields, formState, true);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setJsonError(null);
    await onSubmit(Object.keys(payload).length > 0 ? payload : undefined);
  };

  const submitJson = async () => {
    const trimmed = jsonInput.trim();
    if (!trimmed) {
      setJsonError(null);
      await onSubmit(undefined);
      return;
    }
    try {
      const parsedJson = JSON.parse(trimmed);
      if (parsedJson !== null && typeof parsedJson !== 'object') {
        throw new Error('JSON payload must be an object');
      }
      const payload =
        parsedJson && typeof parsedJson === 'object' && Object.keys(parsedJson as Record<string, unknown>).length > 0
          ? (parsedJson as Record<string, unknown>)
          : undefined;
      setJsonError(null);
      await onSubmit(payload);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON payload');
    }
  };

  if (!supportsForm) {
    if (declaredNoParams && !showJsonEditor) {
      return (
        <NoParamsCard
          disabled={disabled}
          loading={loading}
          onCall={() => {
            void submitJson();
          }}
          onProvide={() => {
            setShowJsonEditor(true);
            syncJsonFromForm();
          }}
        />
      );
    }
    return (
      <JsonOnlyForm
        disabled={disabled}
        loading={loading}
        jsonInput={jsonInput}
        onJsonChange={setJsonInput}
        jsonError={jsonError}
        onSubmit={submitJson}
        declaredNoParams={declaredNoParams}
        {...(declaredNoParams ? { onDismiss: () => setShowJsonEditor(false) } : {})}
      />
    );
  }

  const shouldShowEmptyJsonState = mode === 'json' && declaredNoParams && !showJsonEditor;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Form Mode
          <ToggleSwitch
            checked={mode === 'form'}
            onChange={handleModeToggle}
            disabled={disabled || loading}
            size="sm"
          />
          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{mode === 'form' ? 'Form' : 'JSON'}</span>
        </div>
        {declaredNoParams && mode === 'form' && (
          <button
            type="button"
            onClick={() => {
              setShowJsonEditor(prev => !prev);
              if (!showJsonEditor) {
                syncJsonFromForm();
                setMode('json');
              }
            }}
            className="text-xs text-gray-500 underline-offset-2 transition hover:text-gray-700 hover:underline dark:text-gray-300 dark:hover:text-gray-100"
            disabled={disabled || loading}
          >
            {showJsonEditor ? 'Hide JSON editor' : 'Provide JSON payload'}
          </button>
        )}
      </div>
      {mode === 'json' || showJsonEditor ? (
        shouldShowEmptyJsonState ? (
          <NoParamsCard
            disabled={disabled}
            loading={loading}
            onCall={() => {
              void submitJson();
            }}
            onProvide={() => {
              setShowJsonEditor(true);
              syncJsonFromForm();
            }}
          />
        ) : (
          <JsonOnlyForm
            disabled={disabled}
            loading={loading}
            jsonInput={jsonInput}
            onJsonChange={setJsonInput}
            jsonError={jsonError}
            onSubmit={submitJson}
            declaredNoParams={declaredNoParams}
            {...(declaredNoParams ? { onDismiss: () => setShowJsonEditor(false) } : {})}
          />
        )
      ) : (
        <form
          className="flex flex-1 flex-col gap-2"
          onSubmit={event => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <div className="flex flex-col gap-2">
            {fields.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">No request parameters needed for this tool.</div>
            ) : (
              fields.map(field => {
                const errorMessage = formErrors[field.name];
                const fieldProps: FieldInputProps = {
                  field,
                  value: formState[field.name],
                  onChange: handleFieldChange,
                  onArrayChange: handleArrayItemChange,
                  onArrayAdd: handleAddArrayItem,
                  onArrayRemove: handleRemoveArrayItem,
                  disabled: disabled || loading,
                };
                if (errorMessage) {
                  fieldProps.error = errorMessage;
                }
                return <FieldInput key={field.name} {...fieldProps} />;
              })
            )}
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => {
                const defaults: Record<string, any> = {};
                fields.forEach(field => {
                  if (field.defaultValue !== undefined) {
                    defaults[field.name] = field.defaultValue;
                  } else if (field.type === 'boolean') {
                    defaults[field.name] = false;
                  } else if (field.type === 'array') {
                    defaults[field.name] = [];
                  } else {
                    defaults[field.name] = '';
                  }
                });
                setFormState(defaults);
                setFormErrors({});
                setJsonError(null);
                setJsonInput(JSON.stringify(defaults, null, 2));
              }}
              disabled={disabled || loading}
            >
              Reset
            </button>
            <LoadingButton
              type="submit"
              loading={loading}
              disabled={disabled}
              className="px-3 py-1.5"
            >
              Call Tool
            </LoadingButton>
          </div>
        </form>
      )}
    </div>
  );
}

interface NoParamsCardProps {
  disabled: boolean;
  loading: boolean;
  onCall: () => void;
  onProvide: () => void;
}

function NoParamsCard({ disabled, loading, onCall, onProvide }: NoParamsCardProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-md border border-dashed border-gray-300 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
      <div className="max-w-xs space-y-1">
        <p className="font-medium text-gray-700 dark:text-gray-100">No request parameters needed</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This tool does not declare any input arguments. Call it directly or provide a JSON payload if you need to send
          custom data.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <LoadingButton onClick={onCall} loading={loading} disabled={disabled} className="px-3 py-1.5">
          Call Tool
        </LoadingButton>
        <button
          type="button"
          onClick={onProvide}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          disabled={disabled || loading}
        >
          Provide JSON payload
        </button>
      </div>
    </div>
  );
}

interface JsonOnlyFormProps {
  disabled: boolean;
  loading: boolean;
  jsonInput: string;
  onJsonChange: (value: string) => void;
  jsonError: string | null;
  onSubmit: () => Promise<void>;
  declaredNoParams: boolean;
  onDismiss?: () => void;
}

function JsonOnlyForm({
  disabled,
  loading,
  jsonInput,
  onJsonChange,
  jsonError,
  onSubmit,
  declaredNoParams,
  onDismiss,
}: JsonOnlyFormProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      {(declaredNoParams || onDismiss) && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          {declaredNoParams ? (
            <span>No request parameters needed for this tool.</span>
          ) : (
            <span className="sr-only">JSON editor</span>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-xs text-gray-500 underline-offset-2 transition hover:text-gray-700 hover:underline dark:text-gray-300 dark:hover:text-gray-100"
              disabled={disabled || loading}
            >
              Hide JSON editor
            </button>
          )}
        </div>
      )}
      {declaredNoParams && !onDismiss && (
        <div className="text-sm text-gray-500 dark:text-gray-400">No request parameters needed for this tool.</div>
      )}
      <textarea
        value={jsonInput}
        onChange={event => onJsonChange(event.target.value)}
        className="min-h-[160px] flex-1 rounded-md border border-surface-300 bg-white p-3 font-mono text-sm text-surface-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300/50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-brand-500 dark:focus:ring-brand-500/40"
        spellCheck={false}
        disabled={disabled || loading}
      />
      {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
      <div className="mt-auto flex items-center justify-end gap-2">
        <LoadingButton onClick={onSubmit} loading={loading} disabled={disabled} className="px-3 py-1.5">
          Call Tool
        </LoadingButton>
      </div>
    </div>
  );
}

interface FieldInputProps {
  field: SchemaField;
  value: any;
  onChange: (name: string, value: any) => void;
  onArrayChange: (name: string, index: number, value: any) => void;
  onArrayAdd: (field: SchemaField) => void;
  onArrayRemove: (name: string, index: number) => void;
  error?: string;
  disabled: boolean;
}

function FieldInput({
  field,
  value,
  onChange,
  onArrayChange,
  onArrayAdd,
  onArrayRemove,
  error,
  disabled,
}: FieldInputProps) {
  const typeBadgeLabel = describeFieldType(field);
  const isBooleanField = field.type === 'boolean';
  const enumValues = Array.isArray(field.enumValues) ? field.enumValues : [];
  const hasEnumOptions = enumValues.length > 0 && !isBooleanField;

  if (field.type === 'array') {
    const items: any[] = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {field.name}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            <TypeBadge label={typeBadgeLabel} />
          </div>
          <button
            type="button"
            onClick={() => onArrayAdd(field)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            disabled={disabled}
          >
            Add value
          </button>
        </div>
        {field.description && <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
        <div className="flex flex-col gap-1.5">
          {items.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No values</p>
          ) : (
            items.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <PrimitiveInput
                  type={field.itemType!}
                  value={entry}
                  onChange={val => onArrayChange(field.name, index, val)}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() => onArrayRemove(field.name, index)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  const inputId = isBooleanField ? undefined : `field-${field.name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label
          {...(inputId ? { htmlFor: inputId } : {})}
          className={`text-sm font-medium text-gray-700 dark:text-gray-200 ${
            isBooleanField && !disabled ? 'cursor-pointer' : ''
          }`}
          {...(isBooleanField
            ? {
                onClick: () => {
                  if (!disabled) {
                    onChange(field.name, !value);
                  }
                },
              }
            : {})}
        >
          {field.name}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <TypeBadge label={typeBadgeLabel} />
      </div>
      {field.description && <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
      {hasEnumOptions ? (
        <DropdownSelect
          value={normalizeEnumSelection(value)}
          onChange={event => {
            const selected = event.target.value;
            if (!selected) {
              onChange(field.name, '');
              return;
            }
            const decoded = decodeEnumValue(selected, enumValues);
            onChange(field.name, decoded ?? '');
          }}
          options={buildEnumOptions(enumValues, field.required)}
          disabled={disabled}
          fullWidth
          size="sm"
          {...(inputId ? { id: inputId } : {})}
        />
      ) : (
        <PrimitiveInput
          type={field.type as PrimitiveFieldType}
          value={value}
          onChange={val => onChange(field.name, val)}
          disabled={disabled}
          {...(inputId ? { id: inputId } : {})}
        />
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

function TypeBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800/70 dark:text-gray-200"
      title={`Field type: ${label}`}
    >
      {label}
    </span>
  );
}

function encodeEnumValue(value: SchemaEnumValue): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'number') {
    return `n:${value}`;
  }
  return value ? 'b:true' : 'b:false';
}

function normalizeEnumSelection(value: unknown): string {
  if (value === '' || value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return encodeEnumValue(value as SchemaEnumValue);
  }
  return '';
}

function decodeEnumValue(token: string, values: SchemaEnumValue[]): SchemaEnumValue | undefined {
  return values.find(option => encodeEnumValue(option) === token);
}

function buildEnumOptions(values: SchemaEnumValue[], required: boolean) {
  return [
    {
      value: '',
      label: required ? 'Select a value' : 'None',
    },
    ...values.map(value => ({
      value: encodeEnumValue(value),
      label: String(value),
    })),
  ];
}

interface PrimitiveInputProps {
  type: PrimitiveFieldType;
  value: any;
  onChange: (value: any) => void;
  disabled: boolean;
  id?: string;
}

function PrimitiveInput({ type, value, onChange, disabled, id }: PrimitiveInputProps) {
  if (type === 'boolean') {
    const checked = !!value;
    return (
      <ToggleSwitch
        checked={checked}
        onChange={next => onChange(next)}
        disabled={disabled}
        size="sm"
        className="justify-start"
        label={checked ? 'True' : 'False'}
      />
    );
  }

  return (
    <input
      type={type === 'string' ? 'text' : 'number'}
      value={value ?? ''}
      onChange={event => onChange(event.target.value)}
      step={type === 'integer' ? '1' : undefined}
      id={id}
      className="rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm text-surface-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300/50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 dark:focus:border-brand-500 dark:focus:ring-brand-500/40"
      disabled={disabled}
    />
  );
}
