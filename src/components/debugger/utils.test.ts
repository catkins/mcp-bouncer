import { describe, expect, it } from 'vitest';
import { extractToolError } from './utils';

describe('extractToolError', () => {
  it('extracts error message from rpc_error payloads', () => {
    const message = extractToolError({
      type: 'rpc_error',
      message: 'Invalid input',
      error: {
        code: -32602,
        message: 'Invalid input',
        data: { expected: 'object', received: 'undefined' },
      },
    });

    expect(message).toBe('Invalid input');
  });

  it('returns null when no error strings are found', () => {
    const message = extractToolError({
      result: { success: true },
    });

    expect(message).toBeNull();
  });
});
