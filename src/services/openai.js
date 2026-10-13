import { readFileSync } from 'fs';
import OpenAI from 'openai';
import config from '../config.js';
import logger from '../utils/logger.js';
import COMPETITORS from '../competitors.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const loadPrompt = (name) => readFileSync(new URL(`../prompts/${name}`, import.meta.url), 'utf-8');
const classifyTemplate = loadPrompt('classify.txt');

function classifyPrompt(bucket) {
  const c = COMPETITORS[bucket] || COMPETITORS.billcom;
  return classifyTemplate
    .replace('{{notes}}', c.notes ? `\n${c.notes}` : '')
    .replaceAll('{{competitor}}', c.name)
    .replaceAll('{{description}}', c.description);
}
const linkedinMatchPrompt = loadPrompt('linkedin-match.txt');

async function completeJson(systemPrompt, userContent) {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    // GPT-5 models reject custom temperature and count reasoning tokens here
    max_completion_tokens: 4000,
  });

  return JSON.parse(response.choices[0].message.content);
}

// The prompt says never to pitch a low-fit author, and the model sometimes does anyway
// ("if you're ever on the paying side..."). Drop any sentence that names Cleo.
function withoutPitch(reply) {
  const sentences = reply.match(/[^.!?]+[.!?]*/g) || [reply];
  return sentences.filter((s) => !/cleo/i.test(s)).join('').trim();
}

export async function classifyTweet(tweet) {
  const userContent = `Display name: ${tweet.authorName}\nAuthor bio: ${tweet.authorDescription || '(none)'}\n\nTweet: ${tweet.text}`;

  try {
    const result = await completeJson(classifyPrompt(tweet.searchBucket), userContent);
    if (result.fit === 'low' && result.suggestedReply) {
      result.suggestedReply = withoutPitch(result.suggestedReply);
    }
    logger.debug({ tweetText: tweet.text.slice(0, 80), result }, 'Classification result');
    return result;
  } catch (err) {
    logger.error({ err: err.message }, 'Classification failed');
    throw err;
  }
}

// Picks which LinkedIn search result, if any, is the tweet's author.
// Returns { index: number | null, confidence: 'high' | 'medium' }.
export async function matchLinkedIn(tweet, candidates) {
  const userContent = [
    `X display name: ${tweet.authorName}`,
    `X handle: @${tweet.authorUsername}`,
    `Name from profile: ${tweet.personName || '(unknown)'}`,
    `Company from bio: ${tweet.company || '(unknown)'}`,
    `X bio: ${tweet.authorDescription || '(none)'}`,
    `Tweet: ${tweet.text}`,
    '',
    'LinkedIn candidates:',
    ...candidates.map((c, i) => `${i}. ${c.url}\n   Title: ${c.title}\n   Snippet: ${c.description || '(none)'}`),
  ].join('\n');

  return completeJson(linkedinMatchPrompt, userContent);
}
