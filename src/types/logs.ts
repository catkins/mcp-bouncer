export interface RpcLog {
  id: string;
  ts_ms: number;
  session_id: string;
  method: string;
  server_name?: string | null;
  server_version?: string | null;
  server_protocol?: string | null;
  duration_ms?: number | null;
  ok: boolean;
  error?: string | null;
  request_json?: unknown | null;
  response_json?: unknown | null;
  origin?: string | null;
}

export interface LogsQueryParams {
  server?: string;
  method?: string;
  ok?: boolean;
  limit?: number;
  after?: { ts_ms: number; id: string };
  start_ts_ms?: number;
  end_ts_ms?: number;
}

export interface LogsHistogramCount {
  method: string;
  count: number;
}

export interface LogsHistogramBucket {
  start_ts_ms: number;
  end_ts_ms: number;
  counts: LogsHistogramCount[];
}

export interface LogsHistogram {
  start_ts_ms: number | null;
  end_ts_ms: number | null;
  bucket_width_ms: number;
  buckets: LogsHistogramBucket[];
}
