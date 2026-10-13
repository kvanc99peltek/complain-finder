ALTER TABLE tweets ADD COLUMN author_url TEXT;
ALTER TABLE tweets ADD COLUMN linkedin_url TEXT;
ALTER TABLE tweets ADD COLUMN linkedin_confidence TEXT;
ALTER TABLE tweets ADD COLUMN linkedin_source TEXT;

CREATE INDEX IF NOT EXISTS idx_tweets_author_id ON tweets(author_id);
