-- New pilot database only. Never run against the legacy database.
PRAGMA foreign_keys = ON;
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  active_snapshot TEXT,
  last_success TEXT,
  last_attempt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  record_count INTEGER NOT NULL DEFAULT 0,
  source_period TEXT,
  error_code TEXT
);
CREATE TABLE organizations (
  source_id TEXT NOT NULL REFERENCES sources(id),
  snapshot_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  period TEXT,
  PRIMARY KEY(source_id, snapshot_id, source_key)
);
CREATE INDEX organizations_snapshot ON organizations(source_id, snapshot_id, city, search_name);
CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT
);
CREATE VIEW published_organizations AS
SELECT o.* FROM organizations o JOIN sources s
ON o.source_id = s.id AND o.snapshot_id = s.active_snapshot;
