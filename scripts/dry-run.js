// Search and classify without touching the database or Telegram.
// Usage: npm run dry-run                         (the bot's own queries, last 7 days)
//        npm run dry-run -- quickbooks           (one competitor's query)
//        npm run dry-run -- quickbooks '<query>' (any X search query, classified as that competitor)
import { searchQuery, BUCKETS } from '../src/services/twitter.js';
import { classifyTweet } from '../src/services/openai.js';
import { findLinkedIn } from '../src/services/linkedin.js';

const [bucket, customQuery] = process.argv.slice(2);
if (bucket && !BUCKETS[bucket]) throw new Error(`Unknown competitor "${bucket}". Use one of: ${Object.keys(BUCKETS).join(', ')}`);
const queries = bucket ? { [bucket]: customQuery || BUCKETS[bucket] } : BUCKETS;

for (const [bucket, query] of Object.entries(queries)) {
  const tweets = await searchQuery(query, bucket);
  console.log(`\n=== ${bucket}: ${tweets.length} tweets`);

  for (const tweet of tweets) {
    const c = await classifyTweet(tweet);
    if (!c.isComplaint) continue;
    console.log(`\n[${c.severity} | ${c.intent} | fit ${c.fit}] @${tweet.authorUsername}: ${tweet.authorDescription.replace(/\s+/g, ' ').slice(0, 100)}`);
    console.log(`  tweet: ${tweet.text.replace(/\s+/g, ' ')}`);
    console.log(`  fit:   ${c.fitReason} (name: ${c.personName}, company: ${c.company})`);
    console.log(`  reply: ${c.suggestedReply}`);
    if (c.fit === 'medium' || c.fit === 'high') {
      const li = await findLinkedIn({ ...tweet, ...c }, { useCache: false }).catch((err) => ({ error: err.message }));
      console.log(`  linkedin: ${li === undefined ? '(not searched: no key or no name)' : JSON.stringify(li)}`);
    }
    console.log(`  https://twitter.com/i/status/${tweet.id} (thread ${tweet.conversationId})`);
  }
}
