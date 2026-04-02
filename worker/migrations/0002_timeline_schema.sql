-- Migration number: 0002 	 2024-04-02T12:00:00.000Z

-- Create Timeline Sessions table
CREATE TABLE IF NOT EXISTS timeline_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    state TEXT NOT NULL, -- JSON string of the current timeline state
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Timeline Commands table for history
CREATE TABLE IF NOT EXISTS timeline_commands (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES timeline_sessions(id) ON DELETE CASCADE,
    sender TEXT NOT NULL, -- 'user' or 'agent'
    command_type TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON payload
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
