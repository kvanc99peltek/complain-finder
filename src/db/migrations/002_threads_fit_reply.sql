ALTER TABLE tweets ADD COLUMN conversation_id TEXT;
ALTER TABLE tweets ADD COLUMN author_description TEXT;
ALTER TABLE tweets ADD COLUMN fit TEXT;
ALTER TABLE tweets ADD COLUMN fit_reason TEXT;
ALTER TABLE tweets ADD COLUMN suggested_reply TEXT;

CREATE INDEX IF NOT EXISTS idx_tweets_conversation_id ON tweets(conversation_id);
