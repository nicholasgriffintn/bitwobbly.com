-- D1 schema for bitwobbly-oss MVP

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  timeout_ms INTEGER NOT NULL DEFAULT 8000,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  failure_threshold INTEGER NOT NULL DEFAULT 3,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS monitor_state (
  monitor_id TEXT PRIMARY KEY,
  last_checked_at INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT 'unknown', -- 'up'|'down'|'unknown'
  last_latency_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  incident_open INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_pages (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(team_id, slug),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS status_page_components (
  status_page_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (status_page_id, component_id),
  FOREIGN KEY (status_page_id) REFERENCES status_pages(id),
  FOREIGN KEY (component_id) REFERENCES components(id)
);

CREATE TABLE IF NOT EXISTS component_monitors (
  component_id TEXT NOT NULL,
  monitor_id TEXT NOT NULL,
  PRIMARY KEY (component_id, monitor_id),
  FOREIGN KEY (component_id) REFERENCES components(id),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  status_page_id TEXT,
  monitor_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL, -- 'investigating'|'identified'|'monitoring'|'resolved'
  started_at INTEGER NOT NULL,
  resolved_at INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id)
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'webhook'
  config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS notification_policies (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  monitor_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  threshold_failures INTEGER NOT NULL DEFAULT 3,
  notify_on_recovery INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id),
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id)
);

-- seed demo team
INSERT OR IGNORE INTO teams (id, name, created_at) VALUES ('team_demo', 'Demo Team', datetime('now'));
