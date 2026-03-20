// Sprint 345 — morning-caption-push.ts
// PM2 cron (07:30 daily) — auto-sends today's scheduled captions to operator.
// Includes: queue count, Stripe status, WARNING on 0 posts, top-3 queue.
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
    console.log('[caption-push] No posts scheduled for today. Sending queue summary.');
    // Send top-3 from queue even if no slots today
    const ledgerAll = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
    const mpAll = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
    const postedAll = new Set<string>();
    if (existsSync(mpAll)) {
      for (const l of readFileSync(mpAll, 'utf-8').split('\n').filter(l => l.trim())) {
        try { const p = JSON.parse(l); if (p.video_id) postedAll.add(p.video_id); } catch {}
      }
    }
    const expPath = join(ROOT, 'workspace', 'scs001', 'experiments.jsonl');
    const scores = new Map<string, number>();
    if (existsSync(expPath)) {
      for (const l of readFileSync(expPath, 'utf-8').split('\n').filter(l => l.trim())) {
        try { const e = JSON.parse(l); const id = e.clip_id ?? e.video_id; if (id && e.partial_viral_score != null) scores.set(id, e.partial_viral_score); } catch {}
      }
    }
    const queued: Array<{ video_id: string; score: number }> = [];
    if (existsSync(ledgerAll)) {
      for (const l of readFileSync(ledgerAll, 'utf-8').split('\n').filter(l => l.trim())) {
        try { const e = JSON.parse(l); if (e.video_id && !postedAll.has(e.video_id)) queued.push({ video_id: e.video_id, score: scores.get(e.video_id) ?? 0 }); } catch {}
      }
    }
    queued.sort((a, b) => b.score - a.score);
    const top3 = queued.slice(0, 3);
    const stripeK = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
    const sMissing = stripeK.filter(k => !process.env[k]);
    const sStatus = sMissing.length === 0 ? '✅ Ready' : '❌ Not Live';

    const lines = [
      `📋 Morning Digest (${today})`,
      `⚠️ No posts scheduled for today`,
      '',
      `📦 Queue: ${queued.length} videos ready`,
      `📝 Posted: ${postedAll.size}/30`,
      `💳 Stripe: ${sStatus}`,
    ];
    if (queued.length === 0) {
      lines.push('', '⚠️ WARNING: Queue is EMPTY! Run the pipeline to generate content.');
    } else {
      lines.push('', 'Top-3 in queue:');
      for (const q of top3) {
        lines.push(`  • ${q.video_id} — viral: ${Math.round(q.score * 100)}%`);
      }
    }
    // Send without parse_mode to avoid Markdown issues
    const noSlotPayload = JSON.stringify({ chat_id: CHAT_ID, text: lines.join('\n') });
    await new Promise<void>((resolve, reject) => {
      const req = require('https').request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(noSlotPayload) },
      }, (res: any) => {
        let data = '';
        res.on('data', (c: string) => (data += c));
        res.on('end', () => { if (res.statusCode === 200) resolve(); else reject(new Error(`Telegram ${res.statusCode}: ${data}`)); });
      });
      req.on('error', reject);
      req.write(noSlotPayload);
      req.end();
    });
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

  // Queue count — how many videos are ready in publish-ledger
  const ledgerPath = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPostsPath = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let queueCount = 0;
  let postedCount = 0;
  const postedIds = new Set<string>();
  if (existsSync(manualPostsPath)) {
    const lines = readFileSync(manualPostsPath, 'utf-8').split('\n').filter(l => l.trim());
    postedCount = lines.length;
    for (const l of lines) {
      try { const p = JSON.parse(l); if (p.video_id) postedIds.add(p.video_id); } catch {}
    }
  }
  if (existsSync(ledgerPath)) {
    const lines = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const l of lines) {
      try { const e = JSON.parse(l); if (e.video_id && !postedIds.has(e.video_id)) queueCount++; } catch {}
    }
  }

  // Stripe status
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const stripeMissing = stripeKeys.filter(k => !process.env[k]);
  const stripeStatus = stripeMissing.length === 0 ? '✅ Ready' : '❌ Not Live';

  // Header with queue + Stripe (plain text — no Markdown bold to avoid Telegram parsing issues)
  const headerLines = [
    `📋 Morning Post Pack (${today})`,
    `${todaySlots.length} video(s) to post today`,
    '',
    `🎯 Gate: ${schedule.posts_needed} posts needed in ${schedule.days_to_gate} days`,
    `📊 Pace: ${schedule.pace_needed} posts/day`,
    `📦 Queue: ${queueCount} videos ready`,
    `📝 Posted: ${postedCount}/30`,
    `💳 Stripe: ${stripeStatus}`,
  ];

  // WARNING on 0 queued posts
  if (queueCount === 0) {
    headerLines.push('');
    headerLines.push('⚠️ WARNING: Queue is EMPTY! Run the pipeline to generate content.');
  }

  const headerPayload = JSON.stringify({ chat_id: CHAT_ID, text: headerLines.join('\n') });
  await new Promise<void>((resolve, reject) => {
    const req = require('https').request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(headerPayload) },
    }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => { if (res.statusCode === 200) resolve(); else reject(new Error(`Telegram ${res.statusCode}: ${data}`)); });
    });
    req.on('error', reject);
    req.write(headerPayload);
    req.end();
  });

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

    // Sprint 424: Use shared engagement caption module
    const { buildEngagementCaption: _buildCap } = require('./engagement-caption');
    const extraTags = hashtags.split(' ').filter((t: string) => t.startsWith('#'));
    const caption = _buildCap({ videoId: slot.video_id, hookFormula: slot.hook, speaker: slot.speaker, extraHashtags: extraTags });
    const score = Math.round(slot.viral_score * 100);

    // Escape Markdown special chars in dynamic content
    const escMd = (s: string) => s.replace(/([_*`\[\]])/g, '\\$1');
    await sendTelegram([
      `⏰ *${escMd(slot.slot_label)}*`,
      `🎬 \`${slot.video_id}\``,
      slot.speaker !== 'unknown' ? `🎙️ ${escMd(slot.speaker)}` : '',
      `📊 Viral: ${score}% — Hook: ${escMd(slot.hook || 'N/A')}`,
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
