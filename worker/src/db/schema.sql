-- D1 Database Schema for Trem-AI
-- Run with: wrangler d1 execute trem-ai-db --file=src/db/schema.sql

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brief TEXT DEFAULT '',
    status TEXT DEFAULT 'created',
    active_branch TEXT DEFAULT 'main',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    storage_key TEXT,
    size INTEGER,
    duration REAL,
    metadata TEXT,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    workflow_id TEXT,
    branch_name TEXT DEFAULT 'main',
    status TEXT DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    error TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS event_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    job_id TEXT,
    branch_name TEXT DEFAULT 'main',
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    job_id TEXT,
    branch_name TEXT DEFAULT 'main',
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    content_type TEXT DEFAULT 'application/json',
    size INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    head_commit_id TEXT,
    source_branch TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(project_id, name)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON event_logs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id, updated_at DESC);

-- Added for Multi-Agent Planning Phase
CREATE TABLE IF NOT EXISTS agent_plans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    job_id TEXT REFERENCES jobs(id),
    prompt TEXT NOT NULL,
    status TEXT DEFAULT 'planning', -- planning, ready, executing, completed, failed
    strategy_json TEXT, -- The overall narrative/strategy
    agents_json TEXT, -- Selected agents and their tasks
    workflow_json TEXT, -- The DAG/execution graph
    otio_json TEXT, -- The generated or current OTIO draft
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agent_plans_project ON agent_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_plans_job ON agent_plans(job_id);
