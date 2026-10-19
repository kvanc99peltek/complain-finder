import { sendNotification, editAlert } from '../services/telegram.js';
import {
  updateStatus,
  recordFailure,
  incrementMetric,
  getThreadAlert,
  getRecentAuthorAlert,
  recordAlertUpdate,
  getTweetById,
} from '../db/queries.js';
import config from '../config.js';
import logger from '../utils/logger.js';

export const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };
const bySeverity = (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);

// One Telegram message per X thread, and per author within the cooldown. The
// most severe complaint alerts; later ones are recorded against that alert and
// counted in an update line edited into it, so the group is pinged once.
// send and edit are swappable for tests.
export async function dispatchAlerts(qualified, { send = sendNotification, edit = editAlert } = {}) {
  const byThread = [...Map.groupBy(qualified, (tweet) => tweet.conversationId).values()];
  for (const threadTweets of byThread) threadTweets.sort(bySeverity);
  // Most severe thread first, so an author's worst complaint is the one that alerts
  byThread.sort((a, b) => bySeverity(a[0], b[0]));

  const updatedAlerts = new Set();
  const foldInto = (tweet, alert, status) => {
    recordAlertUpdate(tweet.id, alert.id, status);
    incrementMetric('alert_updates');
    updatedAlerts.add(alert.id);
    logger.info({ tweetId: tweet.id, alertTweetId: alert.id, status }, 'Complaint folded into earlier alert');
  };

  for (const threadTweets of byThread) {
    let alert = getThreadAlert(threadTweets[0].conversationId);

    for (const tweet of threadTweets) {
      if (alert) {
        foldInto(tweet, alert, 'thread_update');
        continue;
      }

      const authorAlert = getRecentAuthorAlert(tweet.authorId, config.authorCooldownHours);
      if (authorAlert) {
        foldInto(tweet, authorAlert, 'author_update');
        alert = authorAlert;
        continue;
      }

      try {
        const telegramMsgId = await send(tweet);
        updateStatus(tweet.id, 'notified', { telegramMessageId: telegramMsgId });
        incrementMetric('notified');
        alert = { id: tweet.id };

        logger.info(
          { tweetId: tweet.id, severity: tweet.severity, intent: tweet.intent, fit: tweet.fit },
          'Complaint notified'
        );
      } catch (err) {
        // The next tweet in the thread gets a turn to be the alert
        recordFailure(tweet.id, err.message);
        incrementMetric('errors');
        logger.error({ tweetId: tweet.id, err: err.message }, 'Failed to notify tweet');
      }
    }
  }

  // Once per alert per cycle. A message that is too old or deleted stays as it is;
  // the updates are already recorded, and a new message would defeat the point.
  for (const alertTweetId of updatedAlerts) {
    const row = getTweetById(alertTweetId);
    try {
      await edit(row);
    } catch (err) {
      logger.warn(
        { alertTweetId, telegramMessageId: row.telegram_message_id, err: err.message },
        'Could not add update line to alert'
      );
    }
  }
}
