import { TwitterApi } from 'twitter-api-v2';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getLastSinceId } from '../db/queries.js';
import COMPETITORS from '../competitors.js';

const client = new TwitterApi(config.twitter.bearerToken).readOnly.v2;

const excludeOurs = config.excludeAuthors.map((handle) => ` -from:${handle}`).join('');
const BUCKETS = Object.fromEntries(
  Object.entries(COMPETITORS).map(([bucket, c]) => [bucket, `${c.search} -is:retweet lang:en${excludeOurs}`])
);

// Expanded links from the profile's website field and bio
function profileLinks(author) {
  const urls = [...(author.entities?.url?.urls || []), ...(author.entities?.description?.urls || [])];
  return urls.map((u) => u.expanded_url || u.url).filter(Boolean);
}

function normalizeTweet(tweet, includes, bucket) {
  const author = includes?.users?.find((u) => u.id === tweet.author_id) || {};
  return {
    id: tweet.id,
    authorId: tweet.author_id,
    authorUsername: author.username || 'unknown',
    authorName: author.name || 'Unknown',
    authorDescription: author.description || '',
    authorLinks: profileLinks(author),
    followersCount: author.public_metrics?.followers_count || 0,
    text: tweet.text,
    createdAt: tweet.created_at,
    conversationId: tweet.conversation_id || tweet.id,
    searchBucket: bucket,
  };
}

const MAX_PAGES = 5;

export async function searchQuery(query, bucket, sinceId) {
  const params = {
    max_results: 100,
    'tweet.fields': 'author_id,created_at,text,conversation_id',
    'user.fields': 'username,name,description,public_metrics,url,entities',
    expansions: 'author_id',
  };
  if (sinceId) params.since_id = sinceId;

  const result = await client.search(query, params);

  // Busy searches pile up past 100 during the overnight pause, so page through
  // them. Without a since_id (first run) one page is enough of the backlog.
  if (sinceId) {
    for (let page = 1; page < MAX_PAGES && !result.done; page++) {
      await result.fetchNext();
    }
  }
  if (sinceId && !result.done) {
    logger.warn({ bucket }, 'More new tweets than one poll fetches; older ones were not fetched');
  }

  return result.tweets.map((tweet) => normalizeTweet(tweet, result.includes, bucket));
}

export async function searchByBucket() {
  const allTweets = [];
  const seenIds = new Set();

  for (const [bucket, query] of Object.entries(BUCKETS)) {
    try {
      const tweets = await searchQuery(query, bucket, getLastSinceId(bucket));

      for (const tweet of tweets) {
        if (seenIds.has(tweet.id)) continue;
        seenIds.add(tweet.id);
        allTweets.push(tweet);
      }

      logger.info({ bucket, count: tweets.length }, 'Search completed');
    } catch (err) {
      logger.error({ bucket, err: err.message }, 'Search failed');
    }
  }

  return allTweets;
}

export { BUCKETS };
