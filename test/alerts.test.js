import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// config.js exits without these; nothing here reaches X, OpenAI or Telegram
const dir = mkdtempSync(join(tmpdir(), 'complain-finder-test-'));
Object.assign(process.env, {
  TWITTER_BEARER_TOKEN: 'test',
  OPENAI_API_KEY: 'test',
  TELEGRAM_BOT_TOKEN: '123:test',
  TELEGRAM_CHAT_ID: '-100',
  DB_PATH: join(dir, 'test.db'),
  AUTHOR_COOLDOWN_HOURS: '24',
  LOG_LEVEL: 'silent',
});

const { initDatabase, closeDatabase, getDb } = await import('../src/db/database.js');
const queries = await import('../src/db/queries.js');
const { dispatchAlerts } = await import('../src/jobs/alerts.js');
const { renderAlertRow } = await import('../src/services/telegram.js');

before(() => initDatabase());
after(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

let nextId = 1000;
// A classified, qualified tweet as poll.js hands it to dispatchAlerts
function qualifiedTweet({ author = 'a1', conversationId, severity = 'high' } = {}) {
  const id = String(nextId++);
  const tweet = {
    id,
    authorId: author,
    authorUsername: `user_${author}`,
    authorName: 'Test User',
    authorDescription: '',
    authorLinks: [],
    followersCount: 10,
    text: `QuickBooks held my payout (${id})`,
    createdAt: '2026-10-19T15:00:00.000Z',
    conversationId: conversationId ?? id,
    searchBucket: 'quickbooks',
  };
  const classification = { isComplaint: true, severity, intent: 'payment', reasoning: '', fit: 'high', fitReason: '' };
  queries.saveTweet(tweet);
  queries.updateClassification(id, classification);
  return { ...tweet, ...classification };
}

// Records Telegram calls instead of making them
function fakeTelegram({ editFails = false } = {}) {
  let messageId = 500;
  const calls = { sent: [], edited: [] };
  return {
    calls,
    send: async (tweet) => {
      calls.sent.push(tweet.id);
      return messageId++;
    },
    edit: async (row) => {
      calls.edited.push({ id: row.id, text: renderAlertRow(row).text });
      if (editFails) throw new Error('Bad Request: message to edit not found');
    },
  };
}

const metric = (name) => queries.getDailyMetrics()[name];

test('migrations run to the latest version', () => {
  assert.equal(getDb().pragma('user_version', { simple: true }), 5);
});

test('a new thread with several complaints alerts once, for the most severe one', async () => {
  const root = qualifiedTweet({ author: 'thread1', severity: 'medium' });
  const worst = qualifiedTweet({ author: 'thread1', conversationId: root.id, severity: 'high' });
  const later = qualifiedTweet({ author: 'thread1', conversationId: root.id, severity: 'medium' });
  const tg = fakeTelegram();
  const notifiedBefore = metric('notified');
  const updatesBefore = metric('alert_updates');

  await dispatchAlerts([root, worst, later], tg);

  assert.deepEqual(tg.calls.sent, [worst.id]);
  assert.equal(queries.getTweetById(worst.id).status, 'notified');
  for (const tweet of [root, later]) {
    const row = queries.getTweetById(tweet.id);
    assert.equal(row.status, 'thread_update');
    assert.equal(row.alert_tweet_id, worst.id);
    assert.equal(row.telegram_message_id, null);
  }
  assert.equal(tg.calls.edited.length, 1);
  assert.match(tg.calls.edited[0].text, new RegExp(`🧵 2 more updates · latest: https://twitter.com/user_thread1/status/${later.id}$`));
  assert.equal(metric('notified') - notifiedBefore, 1);
  assert.equal(metric('alert_updates') - updatesBefore, 2);
});

test('a later complaint in an alerted thread edits the alert instead of sending', async () => {
  const root = qualifiedTweet({ author: 'thread2' });
  const tg = fakeTelegram();
  await dispatchAlerts([root], tg);

  const followUp = qualifiedTweet({ author: 'thread2', conversationId: root.id });
  await dispatchAlerts([followUp], tg);

  assert.deepEqual(tg.calls.sent, [root.id]);
  assert.equal(queries.getTweetById(followUp.id).status, 'thread_update');
  assert.equal(tg.calls.edited.length, 1);
  assert.equal(tg.calls.edited[0].id, root.id);
  assert.match(tg.calls.edited[0].text, /🧵 1 more update · latest: /);
});

test('a thread folded into an author alert keeps folding into it', async () => {
  const first = qualifiedTweet({ author: 'author1' });
  const tg = fakeTelegram();
  await dispatchAlerts([first], tg);

  const otherThread = qualifiedTweet({ author: 'author1' });
  await dispatchAlerts([otherThread], tg);
  // Someone else replying in that second thread
  const reply = qualifiedTweet({ author: 'bystander', conversationId: otherThread.id });
  await dispatchAlerts([reply], tg);

  assert.deepEqual(tg.calls.sent, [first.id]);
  assert.equal(queries.getTweetById(otherThread.id).status, 'author_update');
  assert.equal(queries.getTweetById(otherThread.id).alert_tweet_id, first.id);
  assert.equal(queries.getTweetById(reply.id).status, 'thread_update');
  assert.equal(queries.getTweetById(reply.id).alert_tweet_id, first.id);
  assert.match(tg.calls.edited.at(-1).text, /🧵 2 more updates/);
});

test('two new threads from one author in a cycle send one alert', async () => {
  const minor = qualifiedTweet({ author: 'author2', severity: 'medium' });
  const major = qualifiedTweet({ author: 'author2', severity: 'high' });
  const tg = fakeTelegram();

  await dispatchAlerts([minor, major], tg);

  assert.deepEqual(tg.calls.sent, [major.id]);
  assert.equal(queries.getTweetById(minor.id).status, 'author_update');
});

test('an author alert older than the cooldown does not suppress a new thread', async () => {
  const old = qualifiedTweet({ author: 'author3' });
  const tg = fakeTelegram();
  await dispatchAlerts([old], tg);
  getDb().prepare("UPDATE tweets SET notified_at = datetime('now', '-25 hours') WHERE id = ?").run(old.id);

  const fresh = qualifiedTweet({ author: 'author3' });
  await dispatchAlerts([fresh], tg);

  assert.deepEqual(tg.calls.sent, [old.id, fresh.id]);
  assert.equal(queries.getTweetById(fresh.id).status, 'notified');
});

test('alerts sent before notified_at existed count from detected_at', () => {
  const legacy = qualifiedTweet({ author: 'author4' });
  getDb().prepare("UPDATE tweets SET status = 'notified', telegram_message_id = 42 WHERE id = ?").run(legacy.id);

  assert.equal(queries.getRecentAuthorAlert('author4', 24)?.id, legacy.id);
  getDb().prepare("UPDATE tweets SET detected_at = datetime('now', '-30 hours') WHERE id = ?").run(legacy.id);
  assert.equal(queries.getRecentAuthorAlert('author4', 24), undefined);
  assert.equal(queries.getRecentAuthorAlert('author4', 0), undefined);
});

test('a failed edit is logged and never becomes a new message', async () => {
  const root = qualifiedTweet({ author: 'thread3' });
  await dispatchAlerts([root], fakeTelegram());
  const followUp = qualifiedTweet({ author: 'thread3', conversationId: root.id });
  const tg = fakeTelegram({ editFails: true });
  const errorsBefore = metric('errors');

  await dispatchAlerts([followUp], tg);

  assert.deepEqual(tg.calls.sent, []);
  assert.equal(tg.calls.edited.length, 1);
  assert.equal(queries.getTweetById(followUp.id).status, 'thread_update');
  assert.equal(metric('errors'), errorsBefore);
});

test('a failed send lets the next complaint in the thread alert', async () => {
  const first = qualifiedTweet({ author: 'thread4', severity: 'high' });
  const second = qualifiedTweet({ author: 'thread4', conversationId: first.id, severity: 'medium' });
  const tg = fakeTelegram();
  const send = tg.send;
  tg.send = async (tweet) => {
    if (tweet.id === first.id) throw new Error('Telegram down');
    return send(tweet);
  };

  await dispatchAlerts([first, second], tg);

  assert.deepEqual(tg.calls.sent, [second.id]);
  assert.equal(queries.getTweetById(first.id).status, 'error');
  assert.equal(queries.getTweetById(second.id).status, 'notified');
});

test('the update line keeps the keyboard while open and the stamp once handled', async () => {
  const root = qualifiedTweet({ author: 'thread5' });
  await dispatchAlerts([root], fakeTelegram());
  const followUp = qualifiedTweet({ author: 'thread5', conversationId: root.id });
  await dispatchAlerts([followUp], fakeTelegram());

  const open = renderAlertRow(queries.getTweetById(root.id));
  assert.ok(open.keyboard.reply_markup.inline_keyboard.flat().some((b) => b.callback_data === `replied:${root.id}`));
  assert.match(open.text, /🧵 1 more update · latest: .*\d$/);

  queries.updateStatus(root.id, 'replied', { handledBy: '@teammate' });
  const handled = renderAlertRow(queries.getTweetById(root.id));
  assert.equal(handled.keyboard.reply_markup, undefined);
  assert.match(handled.text, /🧵 1 more update · latest: .*\n\n✅ Replied by @teammate$/);
});
