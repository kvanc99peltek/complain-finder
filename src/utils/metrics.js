import { getDailyMetrics } from '../db/queries.js';

export function formatDailyStats(date) {
  const m = getDailyMetrics(date);
  return [
    `📊 *Daily Stats — ${m.date}*`,
    '',
    `🔍 Tweets detected: ${m.tweets_detected}`,
    `🚨 Complaints found: ${m.complaints_found}`,
    `✅ Qualified (medium+): ${m.qualified_complaints}`,
    `📬 Notified: ${m.notified}`,
    `🧵 Folded into earlier alerts: ${m.alert_updates}`,
    `💬 Replied: ${m.replied}`,
    `⏭ Skipped: ${m.skipped}`,
    `❌ False positives: ${m.false_positives}`,
    `⚠️ Errors: ${m.errors}`,
  ].join('\n');
}
