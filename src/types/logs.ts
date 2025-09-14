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
}

export interface LogsQueryParams {
  server?: string;
  ok?: boolean;
  limit?: number;
  after?: { ts_ms: number; id: string };
}

