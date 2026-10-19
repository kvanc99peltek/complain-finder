-- Qualified tweets folded into an earlier alert (same thread, or same author
-- within the cooldown) point at the tweet whose Telegram message they update.
ALTER TABLE tweets ADD COLUMN alert_tweet_id TEXT;
ALTER TABLE tweets ADD COLUMN notified_at TEXT;
ALTER TABLE tweets ADD COLUMN handled_by TEXT;
ALTER TABLE daily_metrics ADD COLUMN alert_updates INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tweets_alert_tweet_id ON tweets(alert_tweet_id);
