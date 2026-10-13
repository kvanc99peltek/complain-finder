import ContextDev from 'context.dev';
import config from '../config.js';
import logger from '../utils/logger.js';
import { matchLinkedIn } from './openai.js';
import { getCachedLinkedIn } from '../db/queries.js';

const contextDev = config.contextDev.apiKey ? new ContextDev({ apiKey: config.contextDev.apiKey }) : null;

const PROFILE_URL = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i;
const MAX_CANDIDATES = 5;

function cleanProfileUrl(url) {
  return url.match(PROFILE_URL)?.[0] ?? null;
}

// Finds the author's LinkedIn profile.
// Order: a link the author put on their own X profile (free), an earlier lookup for the
// same author, then a paid web search for "name + company" on linkedin.com/in, checked by
// the model so a wrong person is dropped. useCache is off for dry runs, which have no DB.
// Returns { url, confidence, source } where a null url with source 'none' is a searched miss.
// Returns undefined when no search could run (no key, or no name to search for),
// so nothing gets cached and a later lookup can try again.
export async function findLinkedIn(tweet, { useCache = true } = {}) {
  const ownLink = (tweet.authorLinks || []).map(cleanProfileUrl).find(Boolean);
  if (ownLink) return { url: ownLink, confidence: 'high', source: 'x_profile' };

  const cached = useCache && getCachedLinkedIn(tweet.authorId);
  if (cached) return cached;

  if (!contextDev || !tweet.personName) return undefined;

  const query = `site:linkedin.com/in "${tweet.personName}"${tweet.company ? ` "${tweet.company}"` : ''}`;
  const response = await contextDev.web.search({ query, numResults: 10, tags: ['complain-finder'] });

  const candidates = (response.results || [])
    .map((r) => ({ url: cleanProfileUrl(r.url || ''), title: r.title, description: r.description }))
    .filter((r) => r.url)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    logger.info({ tweetId: tweet.id, query }, 'LinkedIn search found no profiles');
    return { url: null, confidence: null, source: 'none' };
  }

  const match = await matchLinkedIn(tweet, candidates);
  const picked = Number.isInteger(match.index) ? candidates[match.index] : undefined;
  logger.info({ tweetId: tweet.id, query, picked: picked?.url, reason: match.reason }, 'LinkedIn match');

  return picked
    ? { url: picked.url, confidence: match.confidence === 'high' ? 'high' : 'medium', source: 'search' }
    : { url: null, confidence: null, source: 'none' };
}
