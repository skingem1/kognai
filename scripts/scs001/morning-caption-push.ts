// Sprint 334 — morning-caption-push.ts
// PM2 cron (07:30 daily) — auto-sends today's scheduled captions to operator.
// No command needed — operator wakes up to their posting pack.
//
// Usage: npx ts-node scripts/scs001/morning-caption-push.ts
// PM2:   cron_restart: "30 7 * * *"

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try {
  require('dotenv').config({ path: join(ROOT, '.env') });
} catch { /* dotenv optional */ }

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

if (!BOT_TOKEN || !CHAT_ID) {
  console.log('[caption-push] Missing TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID');
  process.exit(0);
}

function sendTelegram(text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`Telegram ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  console.log('[caption-push] Generating today\'s captions...');

  // Generate schedule
  const { generateSchedule } = require(join(ROOT, 'scripts', 'scs001', 'generate-posting-schedule'));
  const schedule = generateSchedule();

  const today = new Date().toISOString().slice(0, 10);
  const todaySlots = schedule.slots.filter((s: any) => s.date === today);

  if (todaySlots.length === 0) {
    console.log('[caption-push] No posts scheduled for today. Skipping.');
    process.exit(0);
  }

  // Load hashtags
  const topicsPath = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
  let viralHashtags: string[] = [];
  if (existsSync(topicsPath)) {
    try {
      const vt = JSON.parse(readFileSync(topicsPath, 'utf-8'));
      viralHashtags = (vt.topics ?? []).slice(0, 4).map((t: string) => `#${t}`);
    } catch { /* ignore */ }
  }
  if (viralHashtags.length === 0) viralHashtags = ['#ai', '#tech'];
  const hashtags = [...viralHashtags, '#fyp', '#viral', '#learnontiktok'].join(' ');

  // Header
  await sendTelegram([
    `📋 *Morning Post Pack* (${today})`,
    `${todaySlots.length} video(s) to post today`,
    '',
    `🎯 Gate: *${schedule.posts_needed}* posts needed in *${schedule.days_to_gate}* days`,
    `📊 Pace: *${schedule.pace_needed}* posts/day`,
  ].join('\n'));

  // Send each caption
  for (const slot of todaySlots) {
    // Try to load hook text from script JSON
    let hookText: string = slot.speaker !== 'unknown' ? `${slot.speaker} on ${slot.hook}` : slot.hook;
    const runDirs = existsSync(join(ROOT, 'workspace', 'scs001'))
      ? require('fs').readdirSync(join(ROOT, 'workspace', 'scs001')).filter((d: string) => d.startsWith('run-')).sort().reverse()
      : [];
    for (const dir of runDirs.slice(0, 5)) {
      const scriptPath = join(ROOT, 'workspace', 'scs001', dir, 'scripts', `${slot.video_id}.json`);
      if (existsSync(scriptPath)) {
        try {
          const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
          hookText = script.hook ?? script.title ?? script.headline ?? hookText;
        } catch { /* fallback */ }
        break;
      }
    }

    const caption = `${hookText}\n\n${hashtags}`;
    const score = Math.round(slot.viral_score * 100);

    await sendTelegram([
      `⏰ *${slot.slot_label}*`,
      `🎬 \`${slot.video_id}\``,
      slot.speaker !== 'unknown' ? `🎙️ ${slot.speaker}` : '',
      `📊 Viral: ${score}% | Hook: ${slot.hook}`,
    ].filter(Boolean).join('\n'));

    await sendTelegram('```\n' + caption + '\n```');
    await sendTelegram(`_After posting: \`/record ${slot.video_id} 0\`_`);
  }

  console.log(`[caption-push] Sent ${todaySlots.length} captions to operator.`);
}

main().catch(err => {
  console.error(`[caption-push] Error: ${err.message}`);
  process.exit(1);
});
