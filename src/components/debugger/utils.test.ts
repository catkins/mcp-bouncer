import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { parseSchema, preparePayload, extractToolError } from './utils';

afterEach(() => {
  cleanup();
});
describe('debugger utils', () => {
  it('parses object schema with supported fields', () => {
    const schema = {
      type: 'object',
      required: ['message', 'count'],
      properties: {
        message: { type: 'string', description: 'Message' },
        count: { type: 'integer', default: 1 },
        tags: { type: 'array', items: { type: 'string' } },
      },
    };

    const parsed = parseSchema(schema);
    expect(parsed.supportsForm).toBe(true);
    expect(parsed.fields).toHaveLength(3);
    expect(parsed.fields.find(field => field.name === 'count')?.defaultValue).toBe(1);
    expect(parsed.declaredNoParams).toBe(false);
  });

  it('returns declaredNoParams when schema disallows params', () => {
    const parsed = parseSchema({ type: 'object', properties: {} });
    expect(parsed.supportsForm).toBe(false);
    expect(parsed.declaredNoParams).toBe(true);
  });

  it('prepares payloads and reports validation errors', () => {
    const fields = parseSchema({
      type: 'object',
      required: ['count'],
      properties: {
        count: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    }).fields;

    const { payload, errors } = preparePayload(fields, { count: '3', tags: ['a', 'b'] }, true);
    expect(errors).toEqual({});
    expect(payload).toEqual({ count: 3, tags: ['a', 'b'] });

    const invalid = preparePayload(fields, { count: '', tags: ['a', 5] }, true);
    expect(Object.keys(invalid.errors)).toContain('count');
  });

  it('extracts meaningful error messages from tool results', () => {
    expect(
      extractToolError({
        is_error: true,
        content: [
          { type: 'text', text: 'primary failure' },
          { type: 'text', text: 'secondary' },
        ],
      }),
    ).toBe('primary failure');

    expect(
      extractToolError({
        ok: false,
        meta: { error: 'meta failure' },
      }),
    ).toBe('meta failure');

    expect(
      extractToolError({
        error: { message: 'nested failure', detail: 'ignored detail' },
      }),
    ).toBe('nested failure');

    expect(
      extractToolError({
        type: 'error',
        data: { cause: { message: 'deep failure' } },
      }),
    ).toBe('deep failure');
  });
});
