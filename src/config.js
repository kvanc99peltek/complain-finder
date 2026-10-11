import 'dotenv/config';

const required = [
  'TWITTER_BEARER_TOKEN',
  'OPENAI_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your credentials.');
  process.exit(1);
}

const config = Object.freeze({
  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '30', 10),
  minSeverity: process.env.MIN_SEVERITY || 'medium',
  dbPath: process.env.DB_PATH || './data/complain-finder.db',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export default config;
