import { getDb } from './database.js';

export function hasSeenTweet(tweetId) {
  const row = getDb().prepare('SELECT 1 FROM tweets WHERE id = ?').get(tweetId);
  return !!row;
}

export function saveTweet(tweet) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO tweets (id, author_id, author_username, author_name, author_description, followers_count, text, created_at, conversation_id, search_bucket, status)
    VALUES (@id, @authorId, @authorUsername, @authorName, @authorDescription, @followersCount, @text, @createdAt, @conversationId, @searchBucket, 'new')
  `).run({
    id: tweet.id,
    authorId: tweet.authorId,
    authorUsername: tweet.authorUsername,
    authorName: tweet.authorName,
    authorDescription: tweet.authorDescription,
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

export function getTweetByTelegramMessageId(messageId) {
  return getDb().prepare('SELECT * FROM tweets WHERE telegram_message_id = ?').get(messageId);
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

export function getNewTweets() {
  return getDb().prepare("SELECT * FROM tweets WHERE status = 'new' ORDER BY created_at ASC").all();
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
