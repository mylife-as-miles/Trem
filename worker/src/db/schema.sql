-- D1 Database Schema
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brief TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    status TEXT DEFAULT 'idle'
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    storage_key TEXT,
    duration REAL,
    metadata TEXT, -- JSON
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    workflow_id TEXT,
    status TEXT DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS event_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    created_at INTEGER DEFAULT (unixepoch())
);
