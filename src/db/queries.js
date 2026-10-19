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
  if (extra.handledBy !== undefined) {
    sets.push('handled_by = @handledBy');
    params.handledBy = extra.handledBy;
  }
  if (status === 'notified') {
    sets.push("notified_at = datetime('now')");
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

// The alert a thread's complaints are folded into: the first message sent for the
// conversation, or the alert its earlier tweets were folded into.
export function getThreadAlert(conversationId) {
  const row = getDb().prepare(`
    SELECT COALESCE(alert_tweet_id, id) AS alert_id FROM tweets
    WHERE conversation_id = ? AND (telegram_message_id IS NOT NULL OR alert_tweet_id IS NOT NULL)
    ORDER BY telegram_message_id IS NULL, id ASC LIMIT 1
  `).get(conversationId);
  return row && getTweetById(row.alert_id);
}

// The author's latest alert inside the cooldown, so a new thread from the same
// person updates it instead of pinging again. Rows alerted before notified_at
// existed fall back to detected_at.
export function getRecentAuthorAlert(authorId, hours) {
  if (!(hours > 0)) return undefined;
  return getDb().prepare(`
    SELECT * FROM tweets
    WHERE author_id = ? AND telegram_message_id IS NOT NULL
      AND COALESCE(notified_at, detected_at) >= datetime('now', ?)
    ORDER BY COALESCE(notified_at, detected_at) DESC, id DESC LIMIT 1
  `).get(authorId, `-${hours} hours`);
}

// status is 'thread_update' or 'author_update'; no message is sent for either
export function recordAlertUpdate(tweetId, alertTweetId, status) {
  return getDb().prepare(`
    UPDATE tweets SET status = ?, alert_tweet_id = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, alertTweetId, tweetId);
}

// How many tweets were folded into an alert, and the newest of them
export function getAlertUpdates(alertTweetId) {
  return getDb().prepare(`
    SELECT COUNT(*) AS count, MAX(id) AS latestId,
      (SELECT author_username FROM tweets WHERE alert_tweet_id = @id ORDER BY id DESC LIMIT 1) AS latestUsername
    FROM tweets WHERE alert_tweet_id = @id
  `).get({ id: alertTweetId });
}

export function rowToTweet(row) {
  return {
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
  };
}

// Tweets still waiting for a classification and alert: new ones, plus failures
// that have not used up their attempts. Oldest first, so a backlog drains in order.
export function getPendingTweets(maxAttempts, limit) {
  return getDb().prepare(`
    SELECT * FROM tweets
    WHERE status IN ('new', 'error') AND attempts < ?
    ORDER BY id ASC LIMIT ?
  `).all(maxAttempts, limit).map(rowToTweet);
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
    alert_updates: 0,
  };
}
