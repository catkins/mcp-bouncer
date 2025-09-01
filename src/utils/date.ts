import { formatDistance } from 'date-fns';

export type MaybeDate = string | Date | null | undefined;

export function timeAgo(input: MaybeDate): string {
  if (!input) return '';
  try {
    const d = typeof input === 'string' ? new Date(input) : input;
    return formatDistance(d, new Date(), { addSuffix: true });
  } catch {
    return '';
  }
}

// Normalize connected_at coming from varied backend shapes
// Accepts string, Date, null, or Go-style { Time: string }
export function normalizeConnectedAt(value: any): string | Date | null {
  if (!value) return null;
  if (typeof value === 'string' || value instanceof Date) return value;
  if (typeof value === 'object') {
    if (value.Time) return value.Time as string;
    if (value.connected_at) return normalizeConnectedAt(value.connected_at);
  }
  return null;
}

