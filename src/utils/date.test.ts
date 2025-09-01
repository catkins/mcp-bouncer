import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { timeAgo, normalizeConnectedAt } from './date';

describe('date utils', () => {
  const fixed = new Date('2025-01-01T00:00:00.000Z');

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('timeAgo returns empty for null/undefined', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('timeAgo handles Date and string', () => {
    const fiveMinAgo = new Date(fixed.getTime() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinAgo)).toContain('5 minutes ago');
    expect(timeAgo(fiveMinAgo.toISOString())).toContain('5 minutes ago');
  });

  it('normalizeConnectedAt handles various input shapes', () => {
    const iso = '2025-01-01T00:00:00.000Z';
    expect(normalizeConnectedAt(null)).toBeNull();
    expect(normalizeConnectedAt(iso)).toBe(iso);
    const d = new Date(iso);
    expect(normalizeConnectedAt(d)).toBe(d);
    expect(normalizeConnectedAt({ Time: iso })).toBe(iso);
    expect(normalizeConnectedAt({ connected_at: { Time: iso } })).toBe(iso);
  });
});

