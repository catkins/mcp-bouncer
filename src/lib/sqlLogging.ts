// SQL service using Tauri SQL plugin for logging database operations
import Database from '@tauri-apps/plugin-sql';
import { appConfigDir } from '@tauri-apps/api/path';
import type { LogsHistogram, LogsHistogramBucket, LogsQueryParams, RpcLog } from '../types/logs';

type EventRow = RpcLog;

type QueryParams = LogsQueryParams;

export interface HistogramParams {
  server?: string;
  method?: string;
  ok?: boolean;
  max_buckets?: number;
}

// Schema definition for reusability
const SCHEMA_QUERIES = [
  `CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    created_at_ms INTEGER NOT NULL,
    client_name TEXT,
    client_version TEXT,
    client_protocol TEXT,
    last_seen_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rpc_events (
    id TEXT PRIMARY KEY,
    ts_ms INTEGER NOT NULL,
    session_id TEXT REFERENCES sessions(session_id),
    method TEXT NOT NULL,
    server_name TEXT,
    server_version TEXT,
    server_protocol TEXT,
    duration_ms INTEGER,
    ok INTEGER NOT NULL,
    error TEXT,
    request_json TEXT,
    response_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_ts ON rpc_events(ts_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON rpc_events(session_id)`,
] as const;

// Bucket width candidates for histogram calculations
const HISTOGRAM_BUCKET_CANDIDATES = [
  1, 10, 50, 100, 250, 500,
  1_000, 2_000, 5_000, 10_000, 30_000, 60_000,
  120_000, 300_000, 600_000, 1_800_000, 3_600_000,
  7_200_000, 14_400_000, 43_200_000, 86_400_000,
] as const;

class SQLLoggingService {
  private db: Database | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      await this.ensureDb();
    } catch (error) {
      console.error('Failed to initialize SQL logging service:', error);
      throw error;
    }
  }

  private async ensureDb(): Promise<Database> {
    if (!this.db) {
      const uri = await this.databaseUri();
      this.db = await Database.load(uri);
    }
    const db = this.db!;
    if (!this.initialized) {
      for (const query of SCHEMA_QUERIES) {
        await db.execute(query);
      }
      this.initialized = true;
    }
    return db;
  }

  private async databaseUri(): Promise<string> {
    const dir = await appConfigDir();
    const normalized = dir.endsWith('/') ? dir : `${dir}/`;
    const path = `${normalized}logs.sqlite`;
    // SQLite URIs accept backslashes on Windows, but forward slashes are safe cross-platform
    const sanitized = path.replace(/\\/g, '/');
    return `sqlite:${sanitized}`;
  }

  async queryEvents(params: QueryParams = {}): Promise<EventRow[]> {
    const db = await this.ensureDb();
    const { sql, values } = this.buildEventsQuery(params);
    const rows = await db.select<any[]>(sql, values);
    return rows.map(this.mapEventRow);
  }

  private buildEventsQuery(params: QueryParams): { sql: string; values: any[] } {
    let sql = `
      SELECT id, ts_ms, session_id, method, server_name, server_version, 
             server_protocol, duration_ms, ok, error, request_json, response_json 
      FROM rpc_events
    `;
    
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.server) {
      conditions.push('server_name = ?');
      values.push(params.server);
    }
    if (params.method) {
      conditions.push('method = ?');
      values.push(params.method);
    }
    if (params.ok !== undefined) {
      conditions.push('ok = ?');
      values.push(params.ok ? 1 : 0);
    }
    if (params.start_ts_ms) {
      conditions.push('ts_ms >= ?');
      values.push(params.start_ts_ms);
    }
    if (params.end_ts_ms) {
      conditions.push('ts_ms <= ?');
      values.push(params.end_ts_ms);
    }
    if (params.after) {
      conditions.push('(ts_ms < ? OR (ts_ms = ? AND id < ?))');
      values.push(params.after.ts_ms, params.after.ts_ms, params.after.id);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY ts_ms DESC, id DESC LIMIT ?';
    values.push(params.limit || 50);

    return { sql, values };
  }

  private mapEventRow = (row: any): EventRow => {
    const parseField = (value: unknown) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      return value ?? null;
    };

    return {
      id: String(row.id),
      ts_ms: Number(row.ts_ms),
      session_id: String(row.session_id),
      method: String(row.method),
      server_name: row.server_name ?? null,
      server_version: row.server_version ?? null,
      server_protocol: row.server_protocol ?? null,
      duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
      ok: Boolean(row.ok),
      error: row.error ?? null,
      request_json: parseField(row.request_json),
      response_json: parseField(row.response_json),
    };
  };

  async queryEventsSince(
    since_ts_ms: number,
    server?: string,
    method?: string,
    ok?: boolean,
    limit: number = 50
  ): Promise<EventRow[]> {
    const params: QueryParams = {
      start_ts_ms: since_ts_ms + 1, // +1 to exclude the boundary
      limit,
    };
    
    if (server) params.server = server;
    if (method) params.method = method;
    if (ok !== undefined) params.ok = ok;
    
    return this.queryEvents(params);
  }

  async countEvents(server?: string): Promise<number> {
    const db = await this.ensureDb();
    let sql = 'SELECT COUNT(*) as count FROM rpc_events';
    const values: any[] = [];

    if (server) {
      sql += ' WHERE server_name = ?';
      values.push(server);
    }

    const result = await db.select<[{ count: number }]>(sql, values);
    return result[0]?.count || 0;
  }

  async queryEventHistogram(params: HistogramParams = {}): Promise<LogsHistogram> {
    const db = await this.ensureDb();

    // Get time range
    const { min_ts, max_ts } = await this.getTimeRange(db, params);

    if (min_ts == null || max_ts == null) {
      return { start_ts_ms: null, end_ts_ms: null, bucket_width_ms: 0, buckets: [] };
    }

    const range_ms = max_ts - min_ts;
    const bucketWidth = this.chooseBucketWidth(range_ms, params.max_buckets || 80);

    // Get histogram data
    const histogramData = await this.getHistogramData(db, params, min_ts, bucketWidth);
    
    // Build buckets
    const buckets = this.buildHistogramBuckets(min_ts, range_ms, bucketWidth, histogramData);

    return {
      start_ts_ms: Number(min_ts),
      end_ts_ms: Number(max_ts),
      bucket_width_ms: bucketWidth,
      buckets,
    };
  }

  private async getTimeRange(db: Database, params: HistogramParams): Promise<{ min_ts?: number; max_ts?: number }> {
    let sql = 'SELECT MIN(ts_ms) as min_ts, MAX(ts_ms) as max_ts FROM rpc_events';
    const { conditions, values } = this.buildHistogramConditions(params);

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await db.select<[{ min_ts?: number; max_ts?: number }]>(sql, values);
    return result[0] || {};
  }

  private async getHistogramData(
    db: Database,
    params: HistogramParams, 
    min_ts: number, 
    bucketWidth: number
  ): Promise<Array<{ bucket_idx: number; method: string; count: number }>> {
    let sql = `
      SELECT ((ts_ms - ?) / ?) AS bucket_idx, method, COUNT(*) as count 
      FROM rpc_events
    `;
    const values: any[] = [min_ts, bucketWidth];
    const { conditions, values: conditionValues } = this.buildHistogramConditions(params);

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
      values.push(...conditionValues);
    }

    sql += ' GROUP BY bucket_idx, method ORDER BY bucket_idx ASC';

    return db.select<Array<{ bucket_idx: number; method: string; count: number }>>(sql, values);
  }

  private buildHistogramConditions(params: HistogramParams): { conditions: string[]; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.server) {
      conditions.push('server_name = ?');
      values.push(params.server);
    }
    if (params.method) {
      conditions.push('method = ?');
      values.push(params.method);
    }
    if (params.ok !== undefined) {
      conditions.push('ok = ?');
      values.push(params.ok ? 1 : 0);
    }

    return { conditions, values };
  }

  private buildHistogramBuckets(
    min_ts: number,
    range_ms: number,
    bucketWidth: number,
    histogramData: Array<{ bucket_idx: number; method: string; count: number }>
  ): LogsHistogramBucket[] {
    const bucketCount = Math.floor(range_ms / bucketWidth) + 1;
    const buckets: LogsHistogramBucket[] = [];

    // Initialize empty buckets
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        start_ts_ms: min_ts + i * bucketWidth,
        end_ts_ms: min_ts + (i + 1) * bucketWidth,
        counts: [],
      });
    }

    // Fill in the data
    for (const row of histogramData) {
      const bucketIndex = Math.floor(row.bucket_idx);
      const bucket = buckets[bucketIndex];
      if (bucket && bucketIndex >= 0) {
        bucket.counts.push({
          method: row.method,
          count: Number(row.count),
        });
      }
    }

    return buckets;
  }

  private chooseBucketWidth(range_ms: number, max_buckets: number): number {
    if (range_ms <= 0) return 1_000;

    for (const width of HISTOGRAM_BUCKET_CANDIDATES) {
      const buckets = Math.floor(range_ms / width) + 1;
      if (buckets <= max_buckets) {
        return Math.max(width, 1);
      }
    }

    return Math.max(Math.floor(range_ms / max_buckets), 1);
  }
}

// Export a singleton instance
export const sqlLoggingService = new SQLLoggingService();
