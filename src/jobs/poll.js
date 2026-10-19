import { searchByBucket } from '../services/twitter.js';
import { classifyTweet } from '../services/openai.js';
import { findLinkedIn } from '../services/linkedin.js';
import { isPaused } from '../services/telegram.js';
import { dispatchAlerts, SEVERITY_RANK } from './alerts.js';
import {
  saveTweet,
  hasSeenTweet,
  getPendingTweets,
  recordFailure,
  updateClassification,
  incrementMetric,
  saveLinkedIn,
} from '../db/queries.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import COMPETITORS from '../competitors.js';

// A tweet that fails this many times on its own (bad output, Telegram rejecting it) is dropped
const MAX_ATTEMPTS = 5;
// Caps the OpenAI calls one cycle makes when a backlog comes back after an outage
const MAX_PER_CYCLE = 300;
const FIT_RANK = { low: 1, medium: 2, high: 3 };

function meetsMinSeverity(severity) {
  const min = SEVERITY_RANK[config.minSeverity] || 2;
  return (SEVERITY_RANK[severity] || 0) >= min;
}

function meetsMinFit(tweet, fit) {
  const min = FIT_RANK[COMPETITORS[tweet.searchBucket]?.minFit] || 1;
  return (FIT_RANK[fit] || 0) >= min;
}

// Paid lookup, so only for leads worth contacting. Never blocks the alert.
async function attachLinkedIn(tweet) {
  if (tweet.fit !== 'medium' && tweet.fit !== 'high') return;
  try {
    const result = await findLinkedIn(tweet);
    if (!result) return;
    saveLinkedIn(tweet.id, result);
    tweet.linkedinUrl = result.url;
    tweet.linkedinConfidence = result.confidence;
  } catch (err) {
    logger.warn({ tweetId: tweet.id, err: err.message }, 'LinkedIn lookup failed');
  }
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

    // 2. Save new tweets
    let newCount = 0;
    for (const tweet of tweets) {
      if (!hasSeenTweet(tweet.id)) {
        saveTweet(tweet);
        incrementMetric('tweets_detected');
        newCount++;
      }
    }
    logger.info({ newCount }, 'New tweets saved');

    // Work from the database, so tweets that failed in an earlier cycle get another try
    const pending = getPendingTweets(MAX_ATTEMPTS, MAX_PER_CYCLE);
    if (pending.length === 0) {
      logger.info('No new tweets to process');
      return;
    }
    if (pending.length > newCount) {
      logger.info({ retrying: pending.length - newCount }, 'Retrying tweets that failed before');
    }

    // 3. Classify every pending tweet before notifying, so complaints can be grouped by thread
    const qualified = [];
    for (const tweet of pending) {
      try {
        const classification = await classifyTweet(tweet);
        updateClassification(tweet.id, classification);

        if (classification.isComplaint) {
          incrementMetric('complaints_found');
        }

        if (
          classification.isComplaint &&
          meetsMinSeverity(classification.severity) &&
          meetsMinFit(tweet, classification.fit)
        ) {
          incrementMetric('qualified_complaints');
          qualified.push({ ...tweet, ...classification });
        }
      } catch (err) {
        incrementMetric('errors');
        // Out of credits or rate limited: every later call fails the same way, so stop
        // and leave the rest pending for the next cycle without using up their attempts
        if (err.status === 429) {
          recordFailure(tweet.id, err.message, { countAttempt: false });
          logger.error({ err: err.message }, 'OpenAI is refusing requests; will retry next cycle');
          break;
        }
        recordFailure(tweet.id, err.message);
        logger.error({ tweetId: tweet.id, err: err.message }, 'Failed to classify tweet');
      }
    }

    for (const tweet of qualified) {
      await attachLinkedIn(tweet);
    }

    // 4. One alert per thread and per author cooldown; the rest update that alert
    await dispatchAlerts(qualified);

    logger.info('Poll cycle completed');
  } catch (err) {
    logger.error({ err: err.message }, 'Poll cycle failed');
  } finally {
    running = false;
  }
}
