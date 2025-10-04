import type { PrimitiveFieldType, SchemaField, ParsedSchema } from './types';

export function extractToolError(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown>;
  const isExplicitError =
    record.is_error === true ||
    record.isError === true ||
    record.ok === false ||
    record.success === false;

  const tryString = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

  const extractNested = (value: unknown, depth = 0): string | null => {
    if (depth > 4 || value == null) return null;
    const direct = tryString(value);
    if (direct) return direct;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = extractNested(entry, depth + 1);
        if (nested) return nested;
      }
      return null;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const prioritizedKeys = [
        'message',
        'error',
        'detail',
        'description',
        'text',
        'reason',
        'cause',
        'summary',
      ];
      for (const key of prioritizedKeys) {
        if (obj[key] !== undefined) {
          const nested = extractNested(obj[key], depth + 1);
          if (nested) return nested;
        }
      }
    }
    return null;
  };

  const fromMeta = () => {
    const meta = record.meta;
    if (meta && typeof meta === 'object') {
      return tryString((meta as Record<string, unknown>).error ?? (meta as Record<string, unknown>).message);
    }
    return null;
  };

  const fromContentArray = (value: unknown) => {
    if (!Array.isArray(value)) return null;
    for (const entry of value) {
      if (typeof entry === 'string') {
        const text = tryString(entry);
        if (text) return text;
        continue;
      }
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        const text = tryString(obj.text ?? obj.message);
        if (text) return text;
        const data = obj.output ?? obj.data;
        if (data && typeof data === 'object') {
          const nestedText = tryString((data as Record<string, unknown>).text);
          if (nestedText) return nestedText;
        }
      }
    }
    return null;
  };

  const fromErrorObject = () => extractNested(record.error);

  const fromData = () => extractNested(record.data ?? record.output ?? record.result);

  const fromTypeError = () => {
    if (record.type === 'error') {
      return extractNested(record);
    }
    return null;
  };

  const sources = [
    tryString(record.error ?? record.message),
    fromErrorObject(),
    fromMeta(),
    fromData(),
    fromContentArray(record.content ?? record.contents),
    fromContentArray(record.structured_content ?? record.structuredContent),
    fromTypeError(),
  ];

  const message = sources.find(text => text != null) ?? null;
  if (message) return message;
  return isExplicitError ? JSON.stringify(result) : null;
}

export function parseSchema(schema: unknown): ParsedSchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { fields: [], supportsForm: false, declaredNoParams: true };
  }
  const obj = schema as Record<string, unknown>;
  const properties = obj.properties as Record<string, any> | undefined;
  const type = (obj.type as string | undefined) ?? (properties ? 'object' : undefined);

  if (type === 'null') {
    return { fields: [], supportsForm: false, declaredNoParams: true };
  }

  if (type === 'object' && (!properties || Object.keys(properties).length === 0)) {
    const additional = obj.additionalProperties;
    const pattern = obj.patternProperties;
    const hasLooseProperties =
      additional === true || (additional && typeof additional === 'object');
    const hasPatternProperties =
      pattern && typeof pattern === 'object' && Object.keys(pattern as Record<string, unknown>).length > 0;
    if (!hasLooseProperties && !hasPatternProperties) {
      return { fields: [], supportsForm: false, declaredNoParams: true };
    }
  }

  if (type !== 'object' || !properties) {
    return { fields: [], supportsForm: false, declaredNoParams: false };
  }
  const required = Array.isArray(obj.required) ? (obj.required as string[]) : [];
  const fields: SchemaField[] = [];
  for (const [name, descriptor] of Object.entries(properties)) {
    if (!descriptor || typeof descriptor !== 'object') {
      return { fields: [], supportsForm: false, declaredNoParams: false };
    }
    const fieldType = (descriptor.type as string | undefined) ?? 'string';
    if (['string', 'number', 'integer', 'boolean'].includes(fieldType)) {
      const description =
        typeof (descriptor as Record<string, unknown>).description === 'string'
          ? ((descriptor as Record<string, unknown>).description as string)
          : undefined;
      const field: SchemaField = {
        name,
        type: fieldType as PrimitiveFieldType,
        required: required.includes(name),
      };
      if (description !== undefined) {
        field.description = description;
      }
      if (Object.prototype.hasOwnProperty.call(descriptor, 'default')) {
        field.defaultValue = (descriptor as Record<string, unknown>).default;
      }
      fields.push(field);
      continue;
    }
    if (fieldType === 'array') {
      const items = descriptor.items as Record<string, unknown> | undefined;
      const itemType = items && typeof items === 'object' ? (items.type as string | undefined) : undefined;
      if (!itemType || !['string', 'number', 'integer', 'boolean'].includes(itemType)) {
        return { fields: [], supportsForm: false, declaredNoParams: false };
      }
      const description =
        typeof (descriptor as Record<string, unknown>).description === 'string'
          ? ((descriptor as Record<string, unknown>).description as string)
          : undefined;
      const field: SchemaField = {
        name,
        type: 'array',
        itemType: itemType as PrimitiveFieldType,
        required: required.includes(name),
      };
      if (description !== undefined) {
        field.description = description;
      }
      if (Object.prototype.hasOwnProperty.call(descriptor, 'default')) {
        field.defaultValue = (descriptor as Record<string, unknown>).default;
      }
      fields.push(field);
      continue;
    }
    return { fields: [], supportsForm: false, declaredNoParams: false };
  }
  return { fields, supportsForm: true, declaredNoParams: fields.length === 0 };
}

export function preparePayload(
  fields: SchemaField[],
  formState: Record<string, any>,
  strict: boolean,
): { payload: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const payload: Record<string, unknown> = {};
  fields.forEach(field => {
    const raw = formState[field.name];
    if (field.type === 'array') {
      const arr = Array.isArray(raw) ? raw : [];
      if (field.required && arr.length === 0 && strict) {
        errors[field.name] = 'At least one value is required.';
        return;
      }
      const converted: unknown[] = [];
      arr.forEach(item => {
        const result = coercePrimitive(field.itemType!, item);
        if (!result.valid) {
          if (strict) {
            errors[field.name] = result.message ?? 'Invalid value';
          }
        } else if (result.value !== undefined) {
          converted.push(result.value);
        }
        if (!strict && result.value === undefined) {
          // skip silently when not strict
        }
        if (strict && errors[field.name]) return;
      });
      if (converted.length > 0) {
        payload[field.name] = converted;
      } else if (field.required && strict && !errors[field.name]) {
        errors[field.name] = 'At least one valid value is required.';
      }
      return;
    }

    if (raw === '' || raw === undefined || raw === null) {
      if (field.required && strict) {
        errors[field.name] = 'This field is required.';
      }
      return;
    }
    const result = coercePrimitive(field.type as PrimitiveFieldType, raw);
    if (!result.valid) {
      if (strict) {
        errors[field.name] = result.message ?? 'Invalid value';
      }
      return;
    }
    if (result.value !== undefined) {
      payload[field.name] = result.value;
    }
  });
  return { payload, errors };
}

export function describeFieldType(field: SchemaField): string {
  if (field.type === 'array') {
    const item = field.itemType ? formatTypeToken(field.itemType) : 'VALUE';
    return `ARRAY<${item}>`;
  }
  return formatTypeToken(field.type);
}

export function formatTypeToken(value: PrimitiveFieldType | 'array'): string {
  return String(value ?? 'value').toUpperCase();
}

export function coercePrimitive(
  type: PrimitiveFieldType,
  value: any,
): { valid: boolean; value?: unknown; message?: string } {
  if (type === 'string') {
    return { valid: true, value: String(value) };
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return { valid: true, value };
    if (value === 'true') return { valid: true, value: true };
    if (value === 'false') return { valid: true, value: false };
    return { valid: false, message: 'Expected boolean value.' };
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return { valid: false, message: 'Expected a numeric value.' };
  }
  if (type === 'integer' && !Number.isInteger(num)) {
    return { valid: false, message: 'Expected an integer value.' };
  }
  return { valid: true, value: num };
}
