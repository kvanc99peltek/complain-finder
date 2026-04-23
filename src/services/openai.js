import { readFileSync } from 'fs';
import OpenAI from 'openai';
import config from '../config.js';
import logger from '../utils/logger.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const systemPrompt = readFileSync(
  new URL('../prompts/classify.txt', import.meta.url),
  'utf-8'
);

export async function classifyTweet(tweetText) {
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: tweetText },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);

    logger.debug({ tweetText: tweetText.slice(0, 80), result }, 'Classification result');
    return result;
  } catch (err) {
    logger.error({ err: err.message }, 'Classification failed');
    throw err;
  }
}
