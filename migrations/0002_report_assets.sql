PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS report_assets (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  user_id TEXT,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(report_id, asset_id),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_assets_report
  ON report_assets(report_id, asset_kind, created_at DESC);
