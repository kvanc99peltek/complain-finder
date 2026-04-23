import { TwitterApi } from 'twitter-api-v2';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getLastSinceId } from '../db/queries.js';

const client = new TwitterApi(config.twitter.bearerToken).readOnly.v2;

const BUCKETS = {
  onboarding: `("bill.com" OR "@billcom") (onboarding OR "sign up" OR signup OR verify OR verification OR "get started" OR "can't register" OR "won't let me") -is:retweet -is:reply lang:en`,
  payment: `("bill.com" OR "@billcom") (payment OR "not working" OR failed OR "can't pay" OR "can't receive" OR "didn't go through" OR charged OR overcharged OR "where is my money" OR delayed) -is:retweet -is:reply lang:en`,
  support: `("bill.com" OR "@billcom") (support OR "no response" OR "customer service" OR "won't help" OR terrible OR awful OR worst OR hate OR frustrated OR ridiculous OR useless) -is:retweet -is:reply lang:en`,
};

function normalizeTweet(tweet, includes, bucket) {
  const author = includes?.users?.find((u) => u.id === tweet.author_id) || {};
  return {
    id: tweet.id,
    authorId: tweet.author_id,
    authorUsername: author.username || 'unknown',
    authorName: author.name || 'Unknown',
    followersCount: author.public_metrics?.followers_count || 0,
    text: tweet.text,
    createdAt: tweet.created_at,
    searchBucket: bucket,
  };
}

export async function searchByBucket() {
  const allTweets = [];
  const seenIds = new Set();

  for (const [bucket, query] of Object.entries(BUCKETS)) {
    try {
      const sinceId = getLastSinceId(bucket);
      const params = {
        max_results: 10,
        'tweet.fields': 'author_id,created_at,text',
        'user.fields': 'username,name,public_metrics',
        expansions: 'author_id',
      };
      if (sinceId) params.since_id = sinceId;

      const result = await client.search(query, params);

      const tweets = result.data?.data || [];
      const includes = result.data?.includes || {};

      for (const tweet of tweets) {
        if (seenIds.has(tweet.id)) continue;
        seenIds.add(tweet.id);
        allTweets.push(normalizeTweet(tweet, includes, bucket));
      }

      logger.info({ bucket, count: tweets.length }, 'Search completed');
    } catch (err) {
      logger.error({ bucket, err: err.message }, 'Search failed');
    }
  }

  return allTweets;
}

export { BUCKETS };
