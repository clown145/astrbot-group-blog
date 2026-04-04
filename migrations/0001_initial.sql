PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS blogs (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '',
  public_slug TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'unlisted',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  latest_report_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, group_id)
);

CREATE INDEX IF NOT EXISTS idx_blogs_public_slug ON blogs(public_slug);
CREATE INDEX IF NOT EXISTS idx_blogs_platform_group ON blogs(platform, group_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL,
  report_kind TEXT NOT NULL,
  source_mode TEXT NOT NULL,
  snapshot_date TEXT,
  generated_at TEXT NOT NULL,
  template_name TEXT,
  template_version TEXT,
  coverage_status TEXT,
  message_limit_hit INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  active_user_count INTEGER NOT NULL DEFAULT 0,
  total_characters INTEGER NOT NULL DEFAULT 0,
  emoji_count INTEGER NOT NULL DEFAULT 0,
  most_active_period TEXT NOT NULL DEFAULT '',
  publish_payload_r2_key TEXT NOT NULL,
  render_bundle_r2_key TEXT NOT NULL,
  package_r2_key TEXT NOT NULL,
  render_html_r2_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_blog_generated
  ON reports(blog_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_blog_snapshot
  ON reports(blog_id, snapshot_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_daily_snapshot_unique
  ON reports(blog_id, snapshot_date)
  WHERE report_kind = 'daily_snapshot' AND snapshot_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS report_views (
  report_id TEXT PRIMARY KEY,
  coverage_json TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  hourly_activity_json TEXT NOT NULL,
  daily_activity_json TEXT NOT NULL,
  top_users_json TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  quotes_json TEXT NOT NULL,
  chat_quality_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  qq_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  blog_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  bound_at TEXT NOT NULL,
  UNIQUE(account_id, blog_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memberships_account ON memberships(account_id, bound_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_blog ON memberships(blog_id, bound_at DESC);

CREATE TABLE IF NOT EXISTS bind_challenges (
  id TEXT PRIMARY KEY,
  blog_id TEXT NOT NULL,
  qq_number TEXT NOT NULL,
  bind_code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  verified_by_qq TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (blog_id) REFERENCES blogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bind_challenges_lookup
  ON bind_challenges(blog_id, qq_number, expires_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
