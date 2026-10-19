import { Telegraf, Markup } from 'telegraf';
import config from '../config.js';
import logger from '../utils/logger.js';
import {
  getTweetById,
  updateStatus,
  incrementMetric,
  getPendingCount,
  getAlertUpdates,
  rowToTweet,
} from '../db/queries.js';
import { formatDailyStats } from '../utils/metrics.js';
import COMPETITORS from '../competitors.js';

const bot = new Telegraf(config.telegram.botToken);
const chatId = config.telegram.chatId;

let paused = false;

export function isPaused() {
  return paused;
}

const SEVERITY_EMOJI = { low: '🟡', medium: '🟠', high: '🔴' };

function replyIntentUrl(tweet) {
  return `https://twitter.com/intent/tweet?${new URLSearchParams({ in_reply_to: tweet.id })}`;
}

// X HTML-escapes tweet text; the alert is plain text, so show the real characters
const unescapeX = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// Labels stamped on an alert once someone taps a button, keyed by button action
const RESOLUTIONS = {
  replied: { status: 'replied', metric: 'replied', label: '✅ Replied' },
  skip: { status: 'skipped', metric: 'skipped', label: '⏭ Skipped' },
  false: { status: 'not_complaint', metric: 'false_positives', label: '❌ Not a complaint' },
};

const tweetUrl = (username, id) => `https://twitter.com/${username}/status/${id}`;

// updates is getAlertUpdates() for this alert; handled is { label, by } once someone
// tapped a button, which also drops the keyboard as the tap did.
export function buildAlert(tweet, { updates, handled } = {}) {
  const emoji = SEVERITY_EMOJI[tweet.severity] || '⚪';
  const intentLabel = (tweet.intent || 'other').toUpperCase();
  const severityLabel = (tweet.severity || 'unknown').toUpperCase();
  const fitLabel = (tweet.fit || 'unknown').toUpperCase();
  const competitor = (COMPETITORS[tweet.searchBucket] || COMPETITORS.billcom).name;

  // Blank lines split the alert into header, author, tweet and links
  const lines = [
    `${emoji} ${competitor} Complaint · ${intentLabel} · ${severityLabel}`,
    '',
    `👤 @${tweet.authorUsername} · ${Number(tweet.followersCount).toLocaleString()} followers · fit ${fitLabel}`,
  ];
  if (tweet.authorDescription) {
    lines.push(`     ${clip(tweet.authorDescription.replace(/\s+/g, ' '), 80)}`);
  }
  lines.push(
    '',
    `📝 "${unescapeX(tweet.text)}"`,
    '',
    `🔗 Tweet: ${tweetUrl(tweet.authorUsername, tweet.id)}`,
  );
  if (tweet.conversationId && tweet.conversationId !== tweet.id) {
    lines.push(`🧵 Thread: https://twitter.com/i/status/${tweet.conversationId}`);
  }
  if (updates?.count > 0) {
    const noun = updates.count === 1 ? 'update' : 'updates';
    lines.push('', `🧵 ${updates.count} more ${noun} · latest: ${tweetUrl(updates.latestUsername, updates.latestId)}`);
  }
  if (handled) {
    lines.push('', handled.by ? `${handled.label} by ${handled.by}` : handled.label);
    return { text: lines.join('\n'), keyboard: {} };
  }

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url('↩️ Reply on X', replyIntentUrl(tweet)),
      ...(tweet.linkedinUrl ? [Markup.button.url('💼 LinkedIn', tweet.linkedinUrl)] : []),
    ],
    [
      Markup.button.callback('✅ Mark Replied', `replied:${tweet.id}`),
      Markup.button.callback('⏭ Skip', `skip:${tweet.id}`),
      Markup.button.callback('❌ Not a Complaint', `false:${tweet.id}`),
    ],
  ]);
  return { text: lines.join('\n'), keyboard };
}

export async function sendNotification(tweet) {
  const { text, keyboard } = buildAlert(tweet);
  const msg = await bot.telegram.sendMessage(chatId, text, {
    ...keyboard,
    disable_web_page_preview: true,
  });
  return msg.message_id;
}

// Rebuilds an alert from its database row, so the update line can change
// without losing the keyboard or the "handled by" stamp.
export function renderAlertRow(row) {
  const tweet = {
    ...rowToTweet(row),
    severity: row.severity,
    intent: row.intent,
    fit: row.fit,
    linkedinUrl: row.linkedin_url,
  };
  const resolution = Object.values(RESOLUTIONS).find((r) => r.status === row.status);
  const handled = resolution && { label: resolution.label, by: row.handled_by };
  return buildAlert(tweet, { updates: getAlertUpdates(row.id), handled });
}

export async function editAlert(row) {
  const { text, keyboard } = renderAlertRow(row);
  await bot.telegram.editMessageText(chatId, row.telegram_message_id, undefined, text, {
    ...keyboard,
    link_preview_options: { is_disabled: true },
  });
}

// In a group several people see the same alert, so the first tap wins and the
// message is stamped with who handled it.
async function resolveAlert(ctx, { status, metric, label }) {
  const tweetId = ctx.match[1];
  const message = ctx.callbackQuery.message;
  // Message IDs are per chat and restart when a group becomes a supergroup,
  // so look the alert up by the tweet ID carried in the button.
  const tweet = getTweetById(tweetId);
  if (!tweet) {
    await ctx.answerCbQuery('Tweet not found');
    return;
  }
  if (tweet.status !== 'notified') {
    await ctx.answerCbQuery('Someone already handled this one');
    return;
  }

  const who = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  // handled_by lets a later update line rebuild the stamp
  updateStatus(tweetId, status, { handledBy: who });
  incrementMetric(metric);

  await ctx.editMessageText(`${message.text}\n\n${label} by ${who}`, {
    link_preview_options: { is_disabled: true },
  });
  await ctx.answerCbQuery(label);
  logger.info({ tweetId, status, by: who }, 'Alert handled');
}

function setupCallbacks() {
  for (const [action, resolution] of Object.entries(RESOLUTIONS)) {
    bot.action(new RegExp(`^${action}:(.+)$`), (ctx) => resolveAlert(ctx, resolution));
  }
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

  bot.command('chatid', async (ctx) => {
    await ctx.reply(`Chat ID: ${ctx.chat.id}`);
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
