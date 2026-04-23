import 'dotenv/config';
import { TwitterApi } from 'twitter-api-v2';

const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN).readOnly.v2;

const BUCKETS = {
  onboarding: `("bill.com" OR "@billcom") (onboarding OR "sign up" OR signup OR verify OR verification OR "get started" OR "can't register" OR "won't let me") -is:retweet -is:reply lang:en`,
  payment: `("bill.com" OR "@billcom") (payment OR "not working" OR failed OR "can't pay" OR "can't receive" OR "didn't go through" OR charged OR overcharged OR "where is my money" OR delayed) -is:retweet -is:reply lang:en`,
  support: `("bill.com" OR "@billcom") (support OR "no response" OR "customer service" OR "won't help" OR terrible OR awful OR worst OR hate OR frustrated OR ridiculous OR useless) -is:retweet -is:reply lang:en`,
};

async function main() {
  console.log('Testing Twitter API credentials...\n');

  for (const [bucket, query] of Object.entries(BUCKETS)) {
    console.log(`--- Bucket: ${bucket} ---`);
    try {
      const result = await client.search(query, {
        max_results: 10,
        'tweet.fields': 'author_id,created_at,text',
        'user.fields': 'username,name,public_metrics',
        expansions: 'author_id',
      });

      const tweets = result.data?.data || [];
      const users = result.data?.includes?.users || [];

      console.log(`Found ${tweets.length} tweets\n`);
      for (const tweet of tweets) {
        const author = users.find((u) => u.id === tweet.author_id);
        console.log(`  @${author?.username || '?'} (${author?.public_metrics?.followers_count || 0} followers)`);
        console.log(`  "${tweet.text.slice(0, 120)}..."`);
        console.log(`  https://twitter.com/${author?.username}/status/${tweet.id}\n`);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }
  }
}

main();
