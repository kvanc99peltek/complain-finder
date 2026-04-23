import cron from 'node-cron';
import config from './config.js';
import logger from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { startBot, stopBot } from './services/telegram.js';
import { runPollCycle } from './jobs/poll.js';

async function main() {
  logger.info('Starting Complain Finder v0');

  initDatabase();
  await startBot();

  // Run first poll immediately
  await runPollCycle();

  // Schedule recurring polls (skip midnight–8am EST to save API costs)
  const cronExpr = `*/${config.pollIntervalMinutes} * * * *`;
  cron.schedule(cronExpr, () => {
    const estHour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
    if (parseInt(estHour, 10) < 8) {
      logger.debug('Skipping poll — outside active hours (midnight–8am EST)');
      return;
    }
    runPollCycle().catch((err) => {
      logger.error({ err: err.message }, 'Scheduled poll failed');
    });
  });

  logger.info({ intervalMinutes: config.pollIntervalMinutes }, 'Poll cron scheduled');
}

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  stopBot();
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  logger.fatal({ err: err.message }, 'Failed to start');
  process.exit(1);
});
