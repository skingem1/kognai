/**
 * posting-health.ts — Sprint 834
 *
 * Full posting infrastructure health check. Validates:
 * 1. posting-schedule.json exists and is fresh (< 24h old)
 * 2. Scheduled videos have accessible MP4 files
 * 3. Gate progress is on track (pace check)
 * 4. Auto-regenerates schedule if stale
 * 5. Reports summary to console + optional Telegram
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-health.ts [--telegram]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const SCHEDULE_PATH = join(ROOT, 'reports', 'posting-schedule.json');
const MANUAL_POSTS = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const LEDGER_PATH = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
const HEALTH_REPORT = join(ROOT, 'reports', 'posting-health.json');
const GATE_TARGET = 30;
const GATE_DATE = new Date('2026-04-07T00:00:00Z');

interface HealthCheck {
  name: string;
  pass: boolean;
  detail: string;
}

function readJsonLines(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function main() {
  const now = new Date();
  const checks: HealthCheck[] = [];
  const sendTelegram = process.argv.includes('--telegram');

  // 1. Schedule exists
  const scheduleExists = existsSync(SCHEDULE_PATH);
  checks.push({
    name: 'Schedule file',
    pass: scheduleExists,
    detail: scheduleExists ? 'posting-schedule.json exists' : 'MISSING — run posting-schedule.ts',
  });

  let schedule: any = null;
  let scheduleFresh = false;

  if (scheduleExists) {
    try {
      schedule = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf-8'));
      const genAt = new Date(schedule.generated_at);
      const ageHours = (now.getTime() - genAt.getTime()) / (1000 * 60 * 60);
      scheduleFresh = ageHours < 24;
      checks.push({
        name: 'Schedule freshness',
        pass: scheduleFresh,
        detail: scheduleFresh ? `${ageHours.toFixed(1)}h old` : `STALE (${ageHours.toFixed(1)}h old) — regenerating...`,
      });
    } catch (e: any) {
      checks.push({ name: 'Schedule freshness', pass: false, detail: `Parse error: ${e.message}` });
    }
  }

  // Auto-regenerate if stale
  if (!scheduleFresh) {
    try {
      execSync('npx ts-node --transpile-only scripts/scs001/posting-schedule.ts', {
        cwd: ROOT, timeout: 30000, stdio: 'pipe',
      });
      if (existsSync(SCHEDULE_PATH)) {
        schedule = JSON.parse(readFileSync(SCHEDULE_PATH, 'utf-8'));
        checks.push({ name: 'Schedule regeneration', pass: true, detail: 'Auto-regenerated successfully' });
      }
    } catch (e: any) {
      checks.push({ name: 'Schedule regeneration', pass: false, detail: `Failed: ${e.message.slice(0, 100)}` });
    }
  }

  // 2. Gate progress
  // Sprint 1349: Filter dry-run posts (method: browser-post-dry, batch-browser-dry, dry)
  // Only real TikTok posts count toward the gate target.
  const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  const posts = readJsonLines(MANUAL_POSTS);
  const realPosts = posts.filter((e: any) =>
    !e.method || !DRY_METHODS.some((d: string) => String(e.method).includes(d)));
  const posted = realPosts.length;
  const remaining = Math.max(0, GATE_TARGET - posted);
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const paceNeeded = daysLeft > 0 ? remaining / daysLeft : Infinity;
  const onTrack = paceNeeded <= 2.5; // 2.5/day is achievable with 2 slots/day + buffer

  checks.push({
    name: 'Gate progress',
    pass: onTrack,
    detail: `${posted}/${GATE_TARGET} posted · ${remaining} remaining · ${daysLeft}d left · ${paceNeeded.toFixed(1)}/day needed`,
  });

  // 3. Video availability
  const ledger = readJsonLines(LEDGER_PATH);
  const postedIds = new Set(posts.map((e: any) => e.video_id).filter(Boolean));
  let withFiles = 0;
  for (const e of ledger) {
    if (e.video_id && !postedIds.has(e.video_id) && e.video_path && existsSync(e.video_path)) {
      withFiles++;
    }
  }

  const filesOk = withFiles >= remaining;
  checks.push({
    name: 'Video inventory',
    pass: filesOk,
    detail: `${withFiles} unposted videos with MP4 files (need ${remaining})`,
  });

  // 4. Scheduled videos have MP4s
  if (schedule?.schedule) {
    const today = now.toISOString().substring(0, 10);
    const futureSlots = (schedule.schedule as any[])
      .filter(s => s.date >= today)
      .flatMap(s => s.slots)
      .filter((s: any) => s.video_id);

    let slotsWithFiles = 0;
    let slotsMissing = 0;
    const missingIds: string[] = [];

    const delivered = readJsonLines(join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
    for (const slot of futureSlots) {
      const ledgerEntries = ledger.filter((e: any) => e.video_id === slot.video_id);
      const deliveredEntries = delivered.filter((e: any) => e.video_id === slot.video_id);
      const hasFile = ledgerEntries.some((e: any) => e.video_path && existsSync(e.video_path))
        || deliveredEntries.some((e: any) => e.mp4_path && existsSync(e.mp4_path));
      if (hasFile) {
        slotsWithFiles++;
      } else {
        slotsMissing++;
        if (missingIds.length < 3) missingIds.push(slot.video_id);
      }
    }

    checks.push({
      name: 'Scheduled video files',
      pass: slotsMissing === 0,
      detail: slotsMissing === 0
        ? `All ${slotsWithFiles} scheduled slots have MP4 files`
        : `${slotsMissing}/${futureSlots.length} slots missing MP4 (${missingIds.join(', ')})`,
    });
  }

  // 5. Today's schedule
  if (schedule?.schedule) {
    const today = now.toISOString().substring(0, 10);
    const todayEntry = (schedule.schedule as any[]).find(s => s.date === today);
    if (todayEntry) {
      const todayVids = todayEntry.slots.filter((s: any) => s.video_id).length;
      checks.push({
        name: 'Today\'s slots',
        pass: todayVids > 0,
        detail: `${todayVids} videos scheduled for today (${todayEntry.day})`,
      });
    } else {
      checks.push({ name: 'Today\'s slots', pass: false, detail: 'No schedule entry for today' });
    }
  }

  // Output
  const allPass = checks.every(c => c.pass);
  console.log('=== Posting Infrastructure Health Check ===\n');

  for (const c of checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`${icon} ${c.name}: ${c.detail}`);
  }

  console.log(`\n${allPass ? '✅ ALL CHECKS PASS' : '⚠️ SOME CHECKS FAILED'}`);

  // Save report
  const report = {
    generated_at: now.toISOString(),
    all_pass: allPass,
    checks: checks.map(c => ({ name: c.name, pass: c.pass, detail: c.detail })),
    gate: { posted, target: GATE_TARGET, remaining, days_left: daysLeft, pace_needed: parseFloat(paceNeeded.toFixed(1)) },
    inventory: { videos_with_files: withFiles },
  };

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(HEALTH_REPORT, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${HEALTH_REPORT}`);

  // Telegram notification (optional)
  if (sendTelegram) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
    const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';
    if (BOT_TOKEN && CHAT_ID) {
      const msg = [
        `🏥 *Posting Health ${allPass ? '✅' : '⚠️'}*`,
        '',
        ...checks.map(c => `${c.pass ? '✅' : '❌'} ${c.name}`),
        '',
        `📊 Gate: ${posted}/${GATE_TARGET} · ${daysLeft}d left`,
        `📦 Inventory: ${withFiles} videos ready`,
      ].join('\n');

      try {
        const https = require('https');
        const payload = JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' });
        const req = https.request({
          hostname: 'api.telegram.org',
          path: `/bot${BOT_TOKEN}/sendMessage`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        });
        req.write(payload);
        req.end();
        console.log('\nTelegram notification sent.');
      } catch (e: any) {
        console.log(`\nTelegram send failed: ${e.message}`);
      }
    }
  }
}

main();
