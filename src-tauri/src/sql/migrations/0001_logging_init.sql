CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    created_at_ms INTEGER NOT NULL,
    client_name TEXT,
    client_version TEXT,
    client_protocol TEXT,
    last_seen_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rpc_events (
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
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON rpc_events(ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_session ON rpc_events(session_id);
