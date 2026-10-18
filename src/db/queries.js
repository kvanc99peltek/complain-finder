import { getDb } from './database.js';

export function hasSeenTweet(tweetId) {
  const row = getDb().prepare('SELECT 1 FROM tweets WHERE id = ?').get(tweetId);
  return !!row;
}

export function saveTweet(tweet) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO tweets (id, author_id, author_username, author_name, author_description, author_url, followers_count, text, created_at, conversation_id, search_bucket, status)
    VALUES (@id, @authorId, @authorUsername, @authorName, @authorDescription, @authorUrl, @followersCount, @text, @createdAt, @conversationId, @searchBucket, 'new')
  `).run({
    id: tweet.id,
    authorId: tweet.authorId,
    authorUsername: tweet.authorUsername,
    authorName: tweet.authorName,
    authorDescription: tweet.authorDescription,
    authorUrl: tweet.authorLinks?.join(' ') || null,
    followersCount: tweet.followersCount,
    text: tweet.text,
    createdAt: tweet.createdAt,
    conversationId: tweet.conversationId,
    searchBucket: tweet.searchBucket,
  });
}

export function updateClassification(tweetId, classification) {
  return getDb().prepare(`
    UPDATE tweets
    SET is_complaint = @isComplaint,
        severity = @severity,
        intent = @intent,
        reasoning = @reasoning,
        fit = @fit,
        fit_reason = @fitReason,
        suggested_reply = @suggestedReply,
        status = 'classified',
        updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: tweetId,
    isComplaint: classification.isComplaint ? 1 : 0,
    severity: classification.severity,
    intent: classification.intent,
    reasoning: classification.reasoning,
    fit: classification.fit ?? null,
    fitReason: classification.fitReason ?? null,
    suggestedReply: classification.suggestedReply || null,
  });
}

export function updateStatus(tweetId, status, extra = {}) {
  const sets = ["status = @status", "updated_at = datetime('now')"];
  const params = { id: tweetId, status };

  if (extra.telegramMessageId !== undefined) {
    sets.push('telegram_message_id = @telegramMessageId');
    params.telegramMessageId = extra.telegramMessageId;
  }
  if (extra.errorMessage !== undefined) {
    sets.push('error_message = @errorMessage');
    params.errorMessage = extra.errorMessage;
  }

  return getDb().prepare(`UPDATE tweets SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

// Last LinkedIn lookup for this author. linkedin_source 'none' is a recorded miss,
// so a person is searched at most once.
export function getCachedLinkedIn(authorId) {
  return getDb().prepare(`
    SELECT linkedin_url AS url, linkedin_confidence AS confidence, linkedin_source AS source
    FROM tweets
    WHERE author_id = ? AND linkedin_source IS NOT NULL
    ORDER BY id DESC LIMIT 1
  `).get(authorId);
}

export function saveLinkedIn(tweetId, { url, confidence, source }) {
  return getDb().prepare(`
    UPDATE tweets
    SET linkedin_url = ?, linkedin_confidence = ?, linkedin_source = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(url, confidence, source, tweetId);
}

export function getTweetById(tweetId) {
  return getDb().prepare('SELECT * FROM tweets WHERE id = ?').get(tweetId);
}

// Telegram message of the first alert sent for a thread, so later complaints
// in the same conversation can be threaded under it instead of pinging again.
export function getThreadAlertMessageId(conversationId) {
  const row = getDb().prepare(`
    SELECT telegram_message_id FROM tweets
    WHERE conversation_id = ? AND telegram_message_id IS NOT NULL
    ORDER BY id ASC LIMIT 1
  `).get(conversationId);
  return row?.telegram_message_id;
}

// Tweets still waiting for a classification and alert: new ones, plus failures
// that have not used up their attempts. Oldest first, so a backlog drains in order.
export function getPendingTweets(maxAttempts, limit) {
  return getDb().prepare(`
    SELECT * FROM tweets
    WHERE status IN ('new', 'error') AND attempts < ?
    ORDER BY id ASC LIMIT ?
  `).all(maxAttempts, limit).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    authorName: row.author_name,
    authorDescription: row.author_description || '',
    authorLinks: row.author_url ? row.author_url.split(' ') : [],
    followersCount: row.followers_count,
    text: row.text,
    createdAt: row.created_at,
    conversationId: row.conversation_id || row.id,
    searchBucket: row.search_bucket,
    attempts: row.attempts,
  }));
}

// countAttempt is false for outages (quota, rate limits) so they never use up a tweet's retries
export function recordFailure(tweetId, errorMessage, { countAttempt = true } = {}) {
  return getDb().prepare(`
    UPDATE tweets
    SET status = 'error', error_message = ?, attempts = attempts + ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(errorMessage, countAttempt ? 1 : 0, tweetId);
}

export function getLastSinceId(bucket) {
  const row = getDb().prepare(
    'SELECT id FROM tweets WHERE search_bucket = ? ORDER BY id DESC LIMIT 1'
  ).get(bucket);
  return row?.id || undefined;
}

export function getPendingCount() {
  const row = getDb().prepare(
    "SELECT COUNT(*) as count FROM tweets WHERE status IN ('notified')"
  ).get();
  return row.count;
}

export function incrementMetric(metric) {
  const today = new Date().toISOString().slice(0, 10);
  getDb().prepare(`
    INSERT INTO daily_metrics (date, ${metric}) VALUES (?, 1)
    ON CONFLICT(date) DO UPDATE SET ${metric} = ${metric} + 1
  `).run(today);
}

export function getDailyMetrics(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return getDb().prepare('SELECT * FROM daily_metrics WHERE date = ?').get(d) || {
    date: d,
    tweets_detected: 0,
    complaints_found: 0,
    qualified_complaints: 0,
    notified: 0,
    replied: 0,
    skipped: 0,
    false_positives: 0,
    errors: 0,
  };
}
