import { Telegraf, Markup } from 'telegraf';
import config from '../config.js';
import logger from '../utils/logger.js';
import { getTweetByTelegramMessageId, updateStatus, incrementMetric, getPendingCount } from '../db/queries.js';
import { formatDailyStats } from '../utils/metrics.js';

const bot = new Telegraf(config.telegram.botToken);
const chatId = config.telegram.chatId;

let paused = false;

export function isPaused() {
  return paused;
}

const SEVERITY_EMOJI = { low: '🟡', medium: '🟠', high: '🔴' };

function replyIntentUrl(tweet) {
  const params = new URLSearchParams({ in_reply_to: tweet.id });
  if (tweet.suggestedReply) params.set('text', tweet.suggestedReply);
  return `https://twitter.com/intent/tweet?${params}`;
}

// replyTo threads the alert under an earlier one for the same X conversation;
// silent skips the phone notification so a busy thread pings only once.
export async function sendNotification(tweet, { replyTo, silent = false } = {}) {
  const emoji = SEVERITY_EMOJI[tweet.severity] || '⚪';
  const intentLabel = (tweet.intent || 'other').toUpperCase();
  const severityLabel = (tweet.severity || 'unknown').toUpperCase();
  const fitLabel = (tweet.fit || 'unknown').toUpperCase();

  const lines = [
    `${emoji} Bill.com Complaint [${intentLabel} | ${severityLabel}]`,
    '',
    `👤 @${tweet.authorUsername} (${Number(tweet.followersCount).toLocaleString()} followers)`,
  ];
  if (tweet.authorDescription) lines.push(`🪪 ${tweet.authorDescription}`);
  lines.push(
    `📝 "${tweet.text}"`,
    '',
    `🎯 Cleo fit: ${fitLabel}${tweet.fitReason ? `: ${tweet.fitReason}` : ''}`,
    `💡 ${tweet.reasoning || 'No reasoning provided'}`,
    '',
    `🔗 Tweet: https://twitter.com/${tweet.authorUsername}/status/${tweet.id}`,
  );
  if (tweet.conversationId && tweet.conversationId !== tweet.id) {
    lines.push(`🧵 Thread: https://twitter.com/i/status/${tweet.conversationId}`);
  }
  if (tweet.suggestedReply) {
    lines.push('', '✍️ Draft reply:', tweet.suggestedReply);
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('↩️ Reply on X', replyIntentUrl(tweet))],
    [
      Markup.button.callback('✅ Mark Replied', `replied:${tweet.id}`),
      Markup.button.callback('⏭ Skip', `skip:${tweet.id}`),
      Markup.button.callback('❌ Not a Complaint', `false:${tweet.id}`),
    ],
  ]);

  const msg = await bot.telegram.sendMessage(chatId, lines.join('\n'), {
    ...keyboard,
    disable_web_page_preview: true,
    disable_notification: silent,
    ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
  });

  return msg.message_id;
}

function setupCallbacks() {
  bot.action(/^replied:(.+)$/, async (ctx) => {
    const tweetId = ctx.match[1];
    const tweet = getTweetByTelegramMessageId(ctx.callbackQuery.message.message_id);
    if (!tweet) {
      await ctx.answerCbQuery('Tweet not found');
      return;
    }
    updateStatus(tweetId, 'replied');
    incrementMetric('replied');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('Marked as replied ✅');
    logger.info({ tweetId }, 'Tweet marked as replied');
  });

  bot.action(/^skip:(.+)$/, async (ctx) => {
    const tweetId = ctx.match[1];
    updateStatus(tweetId, 'skipped');
    incrementMetric('skipped');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('Skipped ⏭');
    logger.info({ tweetId }, 'Tweet skipped');
  });

  bot.action(/^false:(.+)$/, async (ctx) => {
    const tweetId = ctx.match[1];
    updateStatus(tweetId, 'not_complaint');
    incrementMetric('false_positives');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.answerCbQuery('Marked as not a complaint ❌');
    logger.info({ tweetId }, 'Tweet marked as false positive');
  });
}

function setupCommands() {
  bot.command('stats', async (ctx) => {
    const stats = formatDailyStats();
    await ctx.reply(stats, { parse_mode: 'Markdown' });
  });

  bot.command('status', async (ctx) => {
    const pending = getPendingCount();
    await ctx.reply(`📊 Pending complaints: ${pending}\n🔄 Polling: ${paused ? 'PAUSED' : 'ACTIVE'}`);
  });

  bot.command('pause', async (ctx) => {
    paused = true;
    await ctx.reply('⏸ Polling paused. Use /resume to restart.');
    logger.info('Polling paused via Telegram command');
  });

  bot.command('resume', async (ctx) => {
    paused = false;
    await ctx.reply('▶️ Polling resumed.');
    logger.info('Polling resumed via Telegram command');
  });
}

export async function startBot() {
  setupCallbacks();
  setupCommands();
  bot.launch();
  logger.info('Telegram bot started');
}

export async function stopBot() {
  bot.stop('SIGTERM');
  logger.info('Telegram bot stopped');
}
