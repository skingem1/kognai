/**
 * diagnose-publish-stall.ts — Sprint 1477
 * Diagnoses why SCS-001 post-queue videos are not being published.
 * Reports: queue state, stall reason, top pending titles.
 * Sends a compact summary to Telegram via TELEGRAM_BOT_TOKEN.
 *
 * Usage: npx ts-node scripts/scs001/diagnose-publish-stall.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ROOT = path.resolve(__dirname, '../..');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');

interface QueueEntry {
  video_id: string;
  title: string;
  file: string;
  score: string;
  added_at: string;
  status: string;
}

function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) reject(new Error(`Telegram error: ${JSON.stringify(parsed)}`));
          else resolve();
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  console.log('[diagnose-publish-stall] Starting queue analysis...\n');

  // 1. Check queue file
  if (!fs.existsSync(QUEUE_FILE)) {
    console.error('[diagnose-publish-stall] post-queue.jsonl not found');
    process.exit(1);
  }

  const lines = fs.readFileSync(QUEUE_FILE, 'utf-8').split('\n').filter(Boolean);
  const entries: QueueEntry[] = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }

  // 2. Count by status
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.status] = (counts[e.status] || 0) + 1;
  }

  const pending = entries.filter(e => e.status === 'pending');
  const posted = entries.filter(e => e.status === 'posted' || e.status === 'published');
  const failed = entries.filter(e => e.status === 'failed' || e.status === 'error');
  const naScore = pending.filter(e => e.score === 'N/A' || e.score === '?').length;

  console.log(`Queue summary:`);
  console.log(`  Total entries : ${entries.length}`);
  console.log(`  Pending       : ${pending.length}`);
  console.log(`  Posted        : ${posted.length}`);
  console.log(`  Failed        : ${failed.length}`);
  console.log(`  Pending w/N/A score: ${naScore}`);
  console.log('');

  // 3. Top 5 pending titles
  const top5 = pending.slice(-5).reverse();
  console.log('Top 5 pending (most recent):');
  for (const e of top5) {
    const fileExists = fs.existsSync(e.file);
    console.log(`  [${e.score}] ${e.title.slice(0, 60)} — file: ${fileExists ? '✅' : '❌ MISSING'}`);
  }
  console.log('');

  // 4. Check for missing video files
  const missingFiles = pending.filter(e => !fs.existsSync(e.file));
  console.log(`Missing video files: ${missingFiles.length}/${pending.length}`);

  // 5. Diagnose stall reason
  const stallReasons: string[] = [];

  const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!tiktokToken) {
    stallReasons.push('❌ TIKTOK_ACCESS_TOKEN not set — auto-publish impossible');
  } else {
    stallReasons.push('✅ TIKTOK_ACCESS_TOKEN is set');
  }

  if (missingFiles.length > 0) {
    stallReasons.push(`⚠️  ${missingFiles.length} pending entries reference missing video files`);
  }

  if (naScore === pending.length && pending.length > 0) {
    stallReasons.push(`⚠️  All ${pending.length} pending videos have score=N/A (quality gate may be blocking)`);
  }

  if (posted.length === 0 && pending.length > 0) {
    stallReasons.push('⚠️  0 videos have been posted — publisher may never have run successfully');
  }

  console.log('\nStall diagnosis:');
  for (const r of stallReasons) console.log(`  ${r}`);

  const primaryReason = !tiktokToken
    ? 'TIKTOK_ACCESS_TOKEN missing — manual posting required'
    : missingFiles.length > 0
    ? `${missingFiles.length} video files missing from disk`
    : 'Unknown — check publisher logs';

  console.log(`\nPrimary stall reason: ${primaryReason}`);

  // 6. Send Telegram summary
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn('[diagnose-publish-stall] TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set — skipping Telegram notification');
    process.exit(0);
  }

  const msg = [
    `📊 *SCS-001 Publish Stall Report*`,
    ``,
    `Queue: ${pending.length} pending / ${posted.length} posted / ${failed.length} failed`,
    `Missing files: ${missingFiles.length}/${pending.length}`,
    ``,
    `🚨 *Primary stall reason:*`,
    primaryReason,
    ``,
    `📋 Top 3 pending:`,
    ...top5.slice(0, 3).map(e => `• ${e.title.slice(0, 55)}`),
    ``,
    `_Run: npx ts-node scripts/scs001/diagnose-publish-stall.ts_`,
  ].join('\n');

  try {
    await sendTelegram(botToken, chatId, msg);
    console.log('\n[diagnose-publish-stall] ✅ Telegram summary sent');
  } catch (err: any) {
    console.error(`[diagnose-publish-stall] ⚠️  Telegram failed: ${err.message}`);
  }

  process.exit(0);
}

main();
