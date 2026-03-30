#!/usr/bin/env npx ts-node
/**
 * SCS-001 Production Watchdog — Sprint 270
 *
 * Monitors pipeline health every 6h via PM2 cron. Sends proactive Telegram
 * alerts when issues are detected:
 *   - Pipeline stale (no new content in >24h)
 *   - Gate deadline risk (posts needed vs days remaining)
 *   - Publish ledger has duplicates
 *   - Video storage disk usage
 *   - Captioned video count anomaly
 *
 * Usage:
 *   npx ts-node scripts/scs001/watchdog.ts
 *   WATCHDOG_DRY_RUN=1 npx ts-node scripts/scs001/watchdog.ts
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN       — required (unless dry-run)
 *   OWNER_TELEGRAM_CHAT_ID   — required (unless dry-run)
 *   WATCHDOG_DRY_RUN=1       — skip Telegram, print to stdout
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import * as dotenv from 'dotenv';

const ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
              || '';
const OWNER_ID  = process.env.OWNER_TELEGRAM_CHAT_ID
              || process.env.CEO_TELEGRAM_CHAT_ID
              || '';
const DRY_RUN   = process.env.WATCHDOG_DRY_RUN === '1';

const GATE_DATE    = new Date('2026-04-07T00:00:00Z');
const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;
const STALE_HOURS  = 24;     // alert if no pipeline run in this many hours
const DISK_WARN_GB = 5;      // alert if scs001 workspace exceeds this

// ── Helpers ────────────────────────────────────────────────────────────────────

function readLines(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

// Sprint 1230: excludes dry-run entries from gate checks
function readRealPostsWD(): any[] {
  const dryMethods = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  return (readLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl')) as any[]).filter(
    (e: any) => e.video_id && !(e.method && dryMethods.some((d: string) => String(e.method).includes(d)))
  );
}

function readJSON<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        try { total += fs.statSync(full).size; } catch { /* skip */ }
      } else if (entry.isDirectory()) {
        total += dirSizeBytes(full);
      }
    }
  } catch { /* skip */ }
  return total;
}

// ── Checks ─────────────────────────────────────────────────────────────────────

interface Alert {
  emoji: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
}

function checkPipelineStaleness(): Alert | null {
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  const runDirs = fs.existsSync(scsDir)
    ? fs.readdirSync(scsDir).filter(d => d.startsWith('run-'))
    : [];

  if (runDirs.length === 0) {
    return {
      emoji: '🚨',
      title: 'No pipeline runs found',
      detail: 'No run-* directories in workspace/scs001/. Run the pipeline.',
      severity: 'critical',
    };
  }

  // Find most recent run by directory mtime
  let latestTime = 0;
  for (const dir of runDirs) {
    try {
      const stat = fs.statSync(path.join(scsDir, dir));
      if (stat.mtimeMs > latestTime) latestTime = stat.mtimeMs;
    } catch { /* skip */ }
  }

  const hoursSinceRun = (Date.now() - latestTime) / 3600000;
  if (hoursSinceRun > STALE_HOURS) {
    return {
      emoji: '⚠️',
      title: 'Pipeline stale',
      detail: `Last run: ${Math.round(hoursSinceRun)}h ago (threshold: ${STALE_HOURS}h). Consider running the pipeline.`,
      severity: 'warning',
    };
  }
  return null;
}

function checkGateDeadline(): Alert | null {
  // Sprint 1230: use readRealPostsWD to exclude dry-run entries from gate deadline check
  const manualPosts = readRealPostsWD();
  const postsCount  = manualPosts.length;
  const totalViews: number = manualPosts.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
  const daysLeft    = Math.max(1, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86400000));
  const postsNeeded = Math.max(0, POSTS_TARGET - postsCount);

  if (postsNeeded <= 0 && totalViews >= VIEWS_TARGET) return null;

  const rateNeeded = postsNeeded / daysLeft;

  if (daysLeft <= 7 && postsNeeded > 0) {
    return {
      emoji: '🚨',
      title: 'Gate deadline CRITICAL',
      detail: `${daysLeft}d left, ${postsNeeded} posts needed (${rateNeeded.toFixed(1)}/day). Views: ${totalViews}/${VIEWS_TARGET}.`,
      severity: 'critical',
    };
  }

  if (postsNeeded > 0 && rateNeeded > 3) {
    return {
      emoji: '⚠️',
      title: 'Gate pace behind',
      detail: `Need ${rateNeeded.toFixed(1)} posts/day (${postsNeeded} remaining in ${daysLeft}d). Views: ${totalViews}/${VIEWS_TARGET}.`,
      severity: 'warning',
    };
  }

  if (postsCount === 0) {
    return {
      emoji: '🚨',
      title: 'Zero posts recorded',
      detail: `${daysLeft}d until Apr 7. Need ${POSTS_TARGET} posts + ${VIEWS_TARGET} views. Start NOW.`,
      severity: 'critical',
    };
  }

  return null;
}

function checkLedgerDuplicates(): Alert | null {
  const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const entries = readLines(ledgerPath) as Array<{ video_id?: string }>;
  const ids = entries.map(e => e.video_id).filter(Boolean);
  const uniqueIds = new Set(ids);

  if (ids.length > uniqueIds.size * 1.5) {
    const dupeCount = ids.length - uniqueIds.size;
    return {
      emoji: '⚠️',
      title: 'Ledger has duplicates',
      detail: `${ids.length} entries, ${uniqueIds.size} unique (${dupeCount} dupes). Consider dedup.`,
      severity: 'warning',
    };
  }
  return null;
}

function checkDiskUsage(): Alert | null {
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  const sizeBytes = dirSizeBytes(scsDir);
  const sizeGB = sizeBytes / (1024 * 1024 * 1024);

  if (sizeGB > DISK_WARN_GB) {
    return {
      emoji: '⚠️',
      title: 'Disk usage high',
      detail: `workspace/scs001/ is ${sizeGB.toFixed(1)}GB (threshold: ${DISK_WARN_GB}GB).`,
      severity: 'warning',
    };
  }
  return null;
}

function checkCaptionedVideos(): Alert | null {
  const scsDir = path.join(ROOT, 'workspace', 'scs001');
  if (!fs.existsSync(scsDir)) return null;

  let captionedCount = 0;
  const runDirs = fs.readdirSync(scsDir).filter(d => d.startsWith('run-'));
  for (const dir of runDirs) {
    const capDir = path.join(scsDir, dir, 'caption');
    if (fs.existsSync(capDir)) {
      captionedCount += fs.readdirSync(capDir).filter(f => f.endsWith('-captioned.mp4')).length;
    }
  }

  if (captionedCount === 0) {
    return {
      emoji: '⚠️',
      title: 'No captioned videos',
      detail: 'No *-captioned.mp4 files found in any run. Pipeline may not be producing videos.',
      severity: 'warning',
    };
  }

  return { emoji: '✅', title: 'Captioned videos', detail: `${captionedCount} videos ready`, severity: 'info' };
}

function checkSmokeTest(): Alert | null {
  const reportPath = path.join(ROOT, 'reports', 'smoke-test-latest.json');
  const report = readJSON<{ passed: number; failed: number; timestamp: string }>(reportPath);
  if (!report) {
    return { emoji: '⚠️', title: 'No smoke test report', detail: 'reports/smoke-test-latest.json missing.', severity: 'warning' };
  }

  if (report.failed > 0) {
    return {
      emoji: '🚨',
      title: 'Smoke test failing',
      detail: `${report.failed} stage(s) failing (${report.passed} passed). Last run: ${report.timestamp?.slice(0, 16) ?? 'unknown'}.`,
      severity: 'critical',
    };
  }

  const ageHours = report.timestamp
    ? (Date.now() - new Date(report.timestamp).getTime()) / 3600000
    : Infinity;
  if (ageHours > 48) {
    return { emoji: '⚠️', title: 'Smoke test stale', detail: `Last run ${Math.round(ageHours)}h ago.`, severity: 'warning' };
  }

  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function runAllChecks(): Alert[] {
  const alerts: Alert[] = [];
  const checks = [
    checkPipelineStaleness,
    checkGateDeadline,
    checkLedgerDuplicates,
    checkDiskUsage,
    checkCaptionedVideos,
    checkSmokeTest,
  ];

  for (const check of checks) {
    const result = check();
    if (result) alerts.push(result);
  }

  return alerts;
}

function formatReport(alerts: Alert[]): string {
  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');
  const infos    = alerts.filter(a => a.severity === 'info');

  const lines: string[] = ['🔍 *Watchdog Report*', ''];

  if (critical.length > 0) {
    lines.push('*🚨 CRITICAL*');
    for (const a of critical) lines.push(`${a.emoji} *${a.title}*: ${a.detail}`);
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('*⚠️ Warnings*');
    for (const a of warnings) lines.push(`${a.emoji} *${a.title}*: ${a.detail}`);
    lines.push('');
  }

  if (infos.length > 0) {
    for (const a of infos) lines.push(`${a.emoji} ${a.title}: ${a.detail}`);
    lines.push('');
  }

  if (critical.length === 0 && warnings.length === 0) {
    lines.push('✅ All checks passed — pipeline healthy.');
  }

  lines.push(`_${new Date().toISOString().slice(0, 16)}Z_`);
  return lines.join('\n');
}

function sendTelegram(chatId: string, text: string): Promise<void> {
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Telegram ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  console.log('=== SCS-001 Watchdog — Sprint 270 ===\n');

  const alerts = runAllChecks();
  const report = formatReport(alerts);

  // Always log to stdout
  console.log(report);

  // Write report to disk
  const reportPath = path.join(ROOT, 'reports', 'watchdog-latest.json');
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    alerts: alerts.map(a => ({ severity: a.severity, title: a.title, detail: a.detail })),
    critical_count: alerts.filter(a => a.severity === 'critical').length,
    warning_count: alerts.filter(a => a.severity === 'warning').length,
  }, null, 2));

  // Only send Telegram if there are critical or warning alerts
  const actionable = alerts.filter(a => a.severity !== 'info');
  if (actionable.length === 0) {
    console.log('\n✅ No actionable alerts — skipping Telegram notification.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] Would send to Telegram. Skipping.');
    return;
  }

  if (!BOT_TOKEN || !OWNER_ID) {
    console.error('[watchdog] TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not set — cannot send alert.');
    process.exit(1);
  }

  try {
    await sendTelegram(OWNER_ID, report);
    console.log('\n✅ Alert sent to Telegram.');
  } catch (err) {
    console.error('[watchdog] Failed to send Telegram:', (err as Error).message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[watchdog] Fatal:', err);
  process.exit(1);
});
