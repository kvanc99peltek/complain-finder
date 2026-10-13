// Search and classify without touching the database or Telegram.
// Usage: npm run dry-run              (the bot's own queries, last 7 days)
//        npm run dry-run -- '<query>' (any X search query)
import { searchQuery, BUCKETS } from '../src/services/twitter.js';
import { classifyTweet } from '../src/services/openai.js';
import { findLinkedIn } from '../src/services/linkedin.js';

const queries = process.argv[2] ? { custom: process.argv[2] } : BUCKETS;

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
