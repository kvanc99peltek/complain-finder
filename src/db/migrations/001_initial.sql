CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_name TEXT NOT NULL,
  followers_count INTEGER DEFAULT 0,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  search_bucket TEXT NOT NULL,
  is_complaint INTEGER,
  severity TEXT,
  intent TEXT,
  reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  telegram_message_id INTEGER,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status);
CREATE INDEX IF NOT EXISTS idx_tweets_search_bucket ON tweets(search_bucket);
CREATE INDEX IF NOT EXISTS idx_tweets_detected_at ON tweets(detected_at);

CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT PRIMARY KEY,
  tweets_detected INTEGER NOT NULL DEFAULT 0,
  complaints_found INTEGER NOT NULL DEFAULT 0,
  qualified_complaints INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0,
  replied INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  false_positives INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0
);
