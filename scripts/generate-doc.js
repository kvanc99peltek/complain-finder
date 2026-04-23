import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_PATH = join(homedir(), 'Downloads', 'complain-finder-architecture.pdf');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 28px 36px; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    font-size: 11px;
    line-height: 1.4;
  }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 1px; }
  .subtitle { color: #666; font-size: 11px; margin-bottom: 4px; }
  .desc { margin-bottom: 8px; font-size: 10.5px; color: #444; }
  h2 {
    font-size: 13px; font-weight: 700; color: #0f172a;
    border-bottom: 1.5px solid #d1d5db; padding-bottom: 2px;
    margin: 10px 0 5px;
  }
  h3 { font-size: 11px; font-weight: 600; margin: 6px 0 3px; }
  p, li { margin-bottom: 2px; font-size: 10.5px; }
  ul { padding-left: 16px; }
  li { margin-bottom: 1px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 10px; }
  th, td { border: 1px solid #d1d5db; padding: 2.5px 6px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
  code {
    font-family: 'SF Mono', Menlo, monospace; font-size: 9.5px;
    background: #f1f5f9; padding: 0px 3px; border-radius: 2px;
  }
  pre {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;
    padding: 5px 8px; font-size: 8.5px; line-height: 1.35;
    font-family: 'SF Mono', Menlo, monospace; overflow: hidden;
    margin: 3px 0;
  }
  .page-break { page-break-before: always; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  svg text { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; }
</style>
</head>
<body>

<!-- ==================== PAGE 1 ==================== -->

<h1>Complain Finder</h1>
<p class="subtitle">Technical Architecture -- April 2026</p>
<p class="desc">Automated pipeline: searches X/Twitter for Bill.com complaints, classifies with GPT, delivers Telegram notifications.</p>

<h2>Tech Stack</h2>
<table>
  <tr><th>Layer</th><th>Technology</th><th>Purpose</th></tr>
  <tr><td>Runtime</td><td>Node.js (ES Modules)</td><td>Single-threaded event loop</td></tr>
  <tr><td>Twitter API</td><td>twitter-api-v2 v1.29</td><td>Search recent tweets (v2)</td></tr>
  <tr><td>Classification</td><td>OpenAI gpt-4o-mini</td><td>Complaint detection and categorisation</td></tr>
  <tr><td>Notifications</td><td>Telegraf v4.16</td><td>Real-time Telegram alerts</td></tr>
  <tr><td>Database</td><td>better-sqlite3 (WAL)</td><td>Local zero-config persistence</td></tr>
  <tr><td>Scheduling</td><td>node-cron</td><td>Recurring poll cycles (3 min)</td></tr>
  <tr><td>Logging</td><td>Pino + pino-pretty</td><td>Structured JSON logs</td></tr>
  <tr><td>Config</td><td>dotenv</td><td>Environment variable management</td></tr>
</table>

<h2>Data Flow</h2>
<svg width="440" height="345" viewBox="0 0 440 345" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
      <path d="M0 0 L10 5 L0 10z" fill="#333"/>
    </marker>
  </defs>

  <!-- 1. Oval: Poll Trigger -->
  <ellipse cx="210" cy="14" rx="88" ry="13" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="18" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Poll Trigger (every 3 min)</text>

  <line x1="210" y1="27" x2="210" y2="38" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>

  <!-- 2. Diamond: Active hours? -->
  <polygon points="210,41 280,63 210,85 140,63" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="66" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Active hours?</text>

  <!-- No: left loop -->
  <line x1="140" y1="63" x2="100" y2="63" stroke="#333" stroke-width="1"/>
  <line x1="100" y1="63" x2="100" y2="14" stroke="#333" stroke-width="1"/>
  <line x1="100" y1="14" x2="122" y2="14" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>
  <text x="118" y="58" font-size="8" font-weight="600" fill="#333">No</text>

  <!-- Yes: down -->
  <line x1="210" y1="85" x2="210" y2="97" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>
  <text x="218" y="95" font-size="8" font-weight="600" fill="#333">Yes</text>

  <!-- 3. Rect: Search Twitter -->
  <rect x="140" y="100" width="140" height="24" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="110" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Search X/Twitter</text>
  <text x="210" y="119" text-anchor="middle" font-size="7.5" fill="#64748b">3 buckets x 10 tweets</text>

  <line x1="210" y1="124" x2="210" y2="136" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>

  <!-- 4. Diamond: New tweets? -->
  <polygon points="210,139 280,161 210,183 140,161" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="164" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">New tweets?</text>

  <!-- No: right end -->
  <line x1="280" y1="161" x2="320" y2="161" stroke="#333" stroke-width="1"/>
  <ellipse cx="352" cy="161" rx="28" ry="11" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="352" y="165" text-anchor="middle" font-size="8.5" font-weight="600" fill="#1a1a1a">End</text>
  <text x="295" y="156" font-size="8" font-weight="600" fill="#333">No</text>

  <!-- Yes: down -->
  <line x1="210" y1="183" x2="210" y2="195" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>
  <text x="218" y="193" font-size="8" font-weight="600" fill="#333">Yes</text>

  <!-- 5. Rect: Save to SQLite -->
  <rect x="140" y="198" width="140" height="24" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="208" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Save to SQLite</text>
  <text x="210" y="217" text-anchor="middle" font-size="7.5" fill="#64748b">Deduplicate via since_id</text>

  <line x1="210" y1="222" x2="210" y2="234" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>

  <!-- 6. Rect: Classify -->
  <rect x="130" y="237" width="160" height="24" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="247" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Classify with GPT-4o-mini</text>
  <text x="210" y="256" text-anchor="middle" font-size="7.5" fill="#64748b">JSON mode, temp 0.1</text>

  <line x1="210" y1="261" x2="210" y2="273" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>

  <!-- 7. Diamond: Complaint? -->
  <polygon points="210,276 295,300 210,324 125,300" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="297" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Complaint?</text>
  <text x="210" y="307" text-anchor="middle" font-size="7" fill="#64748b">Severity >= medium</text>

  <!-- No: right -->
  <line x1="295" y1="300" x2="320" y2="300" stroke="#333" stroke-width="1"/>
  <rect x="323" y="290" width="75" height="20" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="360" y="303" text-anchor="middle" font-size="8" fill="#1a1a1a">Mark classified</text>
  <text x="303" y="295" font-size="8" font-weight="600" fill="#333">No</text>

  <!-- Yes: down -->
  <line x1="210" y1="324" x2="210" y2="336" stroke="#333" stroke-width="1" marker-end="url(#ah)"/>
  <text x="218" y="334" font-size="8" font-weight="600" fill="#333">Yes</text>

  <!-- 8. Rect: Send Telegram -->
  <rect x="125" y="339" width="170" height="20" rx="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.2"/>
  <text x="210" y="352" text-anchor="middle" font-size="9" font-weight="600" fill="#1a1a1a">Send Telegram Notification</text>
</svg>

<div class="page-break"></div>

<!-- ==================== PAGE 2 ==================== -->

<h2>Cost Estimate (Monthly)</h2>
<table>
  <tr><th>Service</th><th>Pricing</th><th>Est. Cost</th></tr>
  <tr><td>X API -- Posts:Read</td><td>$0.005/resource, ~50-100 tweets/day</td><td>$5 - $15</td></tr>
  <tr><td>X API -- User:Read</td><td>$0.010/resource, ~50-100 users/day</td><td>$5 - $15</td></tr>
  <tr><td>OpenAI (gpt-4o-mini)</td><td>~200 tokens/tweet, ~50-100/day</td><td>$1 - $2</td></tr>
  <tr><td>Telegram Bot API</td><td>Self-hosted polling</td><td>Free</td></tr>
  <tr><td>Hosting (VPS)</td><td>Any $5 VPS or always-on machine</td><td>~$5</td></tr>
  <tr><td colspan="2" style="text-align:right;font-weight:700;">Estimated Total</td><td style="font-weight:700;">~$16 - $37/mo</td></tr>
</table>

<p style="margin-top:5px;font-size:10px;"><strong>Cost optimisations:</strong> Off-hours skip (midnight-8am EST, saves ~33% API calls) -- <code>since_id</code> dedup (each tweet fetched once) -- gpt-4o-mini at temp 0.1, JSON mode -- concurrency guard prevents overlapping polls.</p>

<h2>Project Structure</h2>
<pre>complain-finder/
+-- src/
|   +-- index.js           Entry point       +-- db/database.js    SQLite init
|   +-- config.js          Env validation     +-- db/queries.js     DB helpers
|   +-- jobs/poll.js       Poll orchestrator  +-- db/migrations/    Schema SQL
|   +-- services/twitter.js   3-bucket search
|   +-- services/openai.js    GPT classify    +-- prompts/classify.txt
|   +-- services/telegram.js  Bot + alerts    +-- utils/logger.js, metrics.js
+-- scripts/  Dev utilities   +-- data/  SQLite DB   +-- package.json</pre>

<h2>Configuration</h2>
<div class="two-col">
<div>
<h3>Required</h3>
<table>
  <tr><th>Variable</th><th>Description</th></tr>
  <tr><td><code>TWITTER_BEARER_TOKEN</code></td><td>X API v2 bearer token</td></tr>
  <tr><td><code>OPENAI_API_KEY</code></td><td>OpenAI API key</td></tr>
  <tr><td><code>TELEGRAM_BOT_TOKEN</code></td><td>Bot token from @BotFather</td></tr>
  <tr><td><code>TELEGRAM_CHAT_ID</code></td><td>Target chat / group ID</td></tr>
</table>
</div>
<div>
<h3>Optional (defaults shown)</h3>
<table>
  <tr><th>Variable</th><th>Default</th></tr>
  <tr><td><code>OPENAI_MODEL</code></td><td>gpt-4o-mini</td></tr>
  <tr><td><code>POLL_INTERVAL_MINUTES</code></td><td>3</td></tr>
  <tr><td><code>MIN_SEVERITY</code></td><td>medium</td></tr>
  <tr><td><code>DB_PATH</code></td><td>./data/complain-finder.db</td></tr>
  <tr><td><code>LOG_LEVEL</code></td><td>info</td></tr>
</table>
</div>
</div>

<div style="margin-top:12px;padding-top:4px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:9px;text-align:center;">
  Complain Finder -- Technical Architecture -- Generated April 2026
</div>

</body>
</html>`;

async function main() {
  console.log('Launching headless Chrome...');
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  console.log('Rendering PDF...');
  await page.pdf({
    path: OUTPUT_PATH,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: false,
  });

  await browser.close();
  console.log(`Done → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
