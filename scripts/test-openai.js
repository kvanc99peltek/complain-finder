import 'dotenv/config';
import { readFileSync } from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const systemPrompt = readFileSync(new URL('../src/prompts/classify.txt', import.meta.url), 'utf-8');

const testTweets = [
  { label: 'Real complaint (payment)', text: "@billcom my payment has been stuck for 3 days. I can't pay my vendors. This is costing my business real money. #frustrated" },
  { label: 'Real complaint (support)', text: "Been trying to reach @billcom support for a week now. No response to emails or calls. Worst customer service ever." },
  { label: 'Real complaint (onboarding)', text: "Can't even sign up for bill.com. Verification keeps failing. What a waste of time." },
  { label: 'Not a complaint (news)', text: "Bill.com Holdings reported Q3 earnings above analyst expectations, with revenue up 20% year-over-year." },
  { label: 'Not a complaint (neutral)', text: "Just started using bill.com for our invoicing. Setting things up today." },
  { label: 'Not a complaint (joke)', text: "bill.com? more like bill dot calm down it's just an invoice lol" },
];

async function main() {
  console.log(`Testing classification with ${model}...\n`);

  for (const { label, text } of testTweets) {
    console.log(`--- ${label} ---`);
    console.log(`Tweet: "${text}"`);

    try {
      const response = await openai.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log(`Result:`, result);
      console.log();
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
    }
  }
}

main();
