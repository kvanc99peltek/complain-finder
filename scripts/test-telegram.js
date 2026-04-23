import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_CHAT_ID;

async function main() {
  console.log('Sending test notification to Telegram...\n');

  const text = [
    '🔴 Bill.com Complaint [PAYMENT | HIGH]',
    '',
    '👤 @testuser (1,234 followers)',
    '📝 "My payment has been stuck for 3 days on bill.com. This is unacceptable!"',
    '',
    '🔗 View tweet: https://twitter.com/testuser/status/123456789',
    '🏷 Bucket: Payment Failures',
    '💡 "User reports payment stuck for 3 days, affecting their business"',
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('✅ Mark Replied', 'test:replied'),
    Markup.button.callback('⏭ Skip', 'test:skip'),
    Markup.button.callback('❌ Not a Complaint', 'test:false'),
  ]);

  try {
    const msg = await bot.telegram.sendMessage(chatId, text, {
      ...keyboard,
      disable_web_page_preview: true,
    });
    console.log(`Message sent! ID: ${msg.message_id}`);
    console.log('Check your Telegram for the notification with buttons.');
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

main();
