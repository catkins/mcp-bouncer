import type { ClientStatus } from '../../tauri/bridge';

export type PrimitiveFieldType = 'string' | 'number' | 'integer' | 'boolean';
export type SchemaEnumValue = string | number | boolean;

export interface SchemaField {
  name: string;
  type: PrimitiveFieldType | 'array';
  itemType?: PrimitiveFieldType;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  enumValues?: SchemaEnumValue[];
}

export interface ParsedSchema {
  fields: SchemaField[];
  supportsForm: boolean;
  declaredNoParams: boolean;
}

export interface CallOutcome {
  timestamp: number;
  ok: boolean;
  durationMs: number;
  result: unknown;
  request: unknown;
}

export interface DebuggerServerOption {
  name: string;
  description: string;
}

export type { ClientStatus };
