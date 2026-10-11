import { searchByBucket } from '../services/twitter.js';
import { classifyTweet } from '../services/openai.js';
import { sendNotification, isPaused } from '../services/telegram.js';
import {
  saveTweet,
  hasSeenTweet,
  updateClassification,
  updateStatus,
  incrementMetric,
  getThreadAlertMessageId,
} from '../db/queries.js';
import config from '../config.js';
import logger from '../utils/logger.js';

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

function meetsMinSeverity(severity) {
  const min = SEVERITY_RANK[config.minSeverity] || 2;
  return (SEVERITY_RANK[severity] || 0) >= min;
}

let running = false;

export async function runPollCycle() {
  if (isPaused()) {
    logger.debug('Polling is paused, skipping cycle');
    return;
  }

  if (running) {
    logger.warn('Previous poll cycle still running, skipping');
    return;
  }

  running = true;
  logger.info('Starting poll cycle');

  try {
    // 1. Search Twitter
    const tweets = await searchByBucket();
    logger.info({ count: tweets.length }, 'Tweets fetched');

    // 2. Save new tweets, collect only the ones we haven't seen
    const newTweets = [];
    for (const tweet of tweets) {
      if (!hasSeenTweet(tweet.id)) {
        saveTweet(tweet);
        incrementMetric('tweets_detected');
        newTweets.push(tweet);
      }
    }
    logger.info({ newCount: newTweets.length }, 'New tweets saved');

    if (newTweets.length === 0) {
      logger.info('No new tweets to process');
      return;
    }

    // 3. Classify every new tweet before notifying, so complaints can be grouped by thread
    const qualified = [];
    for (const tweet of newTweets) {
      try {
        const classification = await classifyTweet(tweet);
        updateClassification(tweet.id, classification);

        if (classification.isComplaint) {
          incrementMetric('complaints_found');
        }

        if (classification.isComplaint && meetsMinSeverity(classification.severity)) {
          incrementMetric('qualified_complaints');
          qualified.push({ ...tweet, ...classification });
        }
      } catch (err) {
        updateStatus(tweet.id, 'error', { errorMessage: err.message });
        incrementMetric('errors');
        logger.error({ tweetId: tweet.id, err: err.message }, 'Failed to classify tweet');
      }
    }

    // 4. One ping per X thread: the first complaint alerts, the rest reply to it silently
    const byThread = Map.groupBy(qualified, (tweet) => tweet.conversationId);
    for (const [conversationId, threadTweets] of byThread) {
      threadTweets.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      let replyTo = getThreadAlertMessageId(conversationId);

      for (const tweet of threadTweets) {
        try {
          const telegramMsgId = await sendNotification(tweet, { replyTo, silent: Boolean(replyTo) });
          replyTo ??= telegramMsgId;
          updateStatus(tweet.id, 'notified', { telegramMessageId: telegramMsgId });
          incrementMetric('notified');

          logger.info(
            { tweetId: tweet.id, severity: tweet.severity, intent: tweet.intent, fit: tweet.fit },
            'Complaint notified'
          );
        } catch (err) {
          updateStatus(tweet.id, 'error', { errorMessage: err.message });
          incrementMetric('errors');
          logger.error({ tweetId: tweet.id, err: err.message }, 'Failed to notify tweet');
        }
      }
    }

    logger.info('Poll cycle completed');
  } catch (err) {
    logger.error({ err: err.message }, 'Poll cycle failed');
  } finally {
    running = false;
  }
}
