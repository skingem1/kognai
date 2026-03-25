/**
 * preflight.ts — Sprint 1226
 * Pre-posting session checklist: verifies systems, counts ready videos,
 * shows gate status, and provides step-by-step posting instructions.
 * Usage: npx ts-node scripts/scs001/preflight.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');

interface Check {
  name: string;
  pass: boolean;
  detail: string;
  action?: string;
}

function readJsonLines(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

export function runPreflight(): { checks: Check[]; summary: string; steps: string[] } {
  const checks: Check[] = [];

  // 1. TikTok token
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  checks.push({
    name: 'TikTok Access Token',
    pass: hasToken,
    detail: hasToken ? 'Token set' : 'MISSING — required for API posting',
    action: hasToken ? undefined : 'Set TIKTOK_ACCESS_TOKEN in .env (or use manual browser posting)',
  });

  // 2. Export manifest
  const manifestPath = path.join(ROOT, 'workspace', 'scs001', 'export-manifest.txt');
  const manifestExists = fs.existsSync(manifestPath);
  const manifestAge = manifestExists ? (Date.now() - fs.statSync(manifestPath).mtimeMs) / 3600000 : Infinity;
  checks.push({
    name: 'Export Manifest',
    pass: manifestExists && manifestAge < 24,
    detail: manifestExists ? `Exists (${manifestAge.toFixed(1)}h old)` : 'MISSING',
    action: !manifestExists ? 'Run /export to generate manifest' : manifestAge >= 24 ? 'Run /export to refresh (stale)' : undefined,
  });

  // 3. Ready videos (with MP4 files)
  const exportFiles = path.join(ROOT, 'workspace', 'scs001', 'export-files.txt');
  let readyCount = 0;
  let missingFiles: string[] = [];
  if (fs.existsSync(exportFiles)) {
    const files = fs.readFileSync(exportFiles, 'utf-8').split('\n').filter(l => l.trim());
    for (const f of files) {
      if (fs.existsSync(f)) readyCount++;
      else missingFiles.push(path.basename(f));
    }
  }
  checks.push({
    name: 'Ready Videos (MP4)',
    pass: readyCount >= 3,
    detail: `${readyCount} videos ready` + (missingFiles.length > 0 ? ` (${missingFiles.length} missing)` : ''),
    action: readyCount < 3 ? 'Run pipeline or /produce to generate more videos' : undefined,
  });

  // 4. Post queue
  const queuePath = path.join(ROOT, 'workspace', 'scs001', 'post-queue.jsonl');
  const queueEntries = readJsonLines(queuePath).filter(e => e.status === 'pending');
  checks.push({
    name: 'Post Queue',
    pass: queueEntries.length > 0,
    detail: `${queueEntries.length} pending` + (queueEntries.length === 0 ? ' — run /queue-fill' : ''),
    action: queueEntries.length === 0 ? 'Run /queue-fill to populate from manifest' : undefined,
  });

  // 5. Gate progress
  const dryMethods = ['browser-post-dry', 'batch-browser-dry', 'dry', 'dry-run', 'post-now-dry'];
  const manualPosts = readJsonLines(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const realPosts = manualPosts.filter(e => e.video_id && !(e.method && dryMethods.some(d => String(e.method).includes(d))));
  const postCount = realPosts.length;
  const gateDate = new Date('2026-04-07T23:59:59Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));
  const remaining = Math.max(0, 30 - postCount);
  const postsPerDay = daysLeft > 0 ? (remaining / daysLeft).toFixed(1) : '∞';
  const pace = remaining === 0 ? 'DONE' : Number(postsPerDay) <= 1.5 ? 'ON-TRACK' : Number(postsPerDay) <= 3 ? 'AT-RISK' : 'CRITICAL';
  checks.push({
    name: 'Gate Progress',
    pass: remaining === 0 || pace === 'ON-TRACK',
    detail: `${postCount}/30 posts · ${remaining} remaining · ${daysLeft}d left · ${postsPerDay}/day needed · ${pace}`,
  });

  // 6. Telegram bot
  let botRunning = false;
  try {
    const pm2Out = require('child_process').execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    botRunning = procs.some((p: any) => p.name === 'telegram-bot' && p.pm2_env?.status === 'online');
  } catch {}
  checks.push({
    name: 'Telegram Bot',
    pass: botRunning,
    detail: botRunning ? 'Online' : 'Not running',
    action: botRunning ? undefined : 'Run: pm2 start telegram-bot',
  });

  // Summary
  const passCount = checks.filter(c => c.pass).length;
  const allPass = passCount === checks.length;
  const summary = allPass
    ? `✅ ALL CLEAR (${passCount}/${checks.length}) — ready to post!`
    : `⚠️ ${passCount}/${checks.length} checks pass — see actions below`;

  // Steps
  const steps: string[] = [];
  if (!hasToken) steps.push('1. Get TikTok access token (or use /post-browser for manual posting)');
  if (!manifestExists || manifestAge >= 24) steps.push(`${steps.length + 1}. Run /export to refresh video manifest`);
  if (queueEntries.length === 0) steps.push(`${steps.length + 1}. Run /queue-fill to populate post queue`);
  if (remaining > 0) steps.push(`${steps.length + 1}. Post ${Math.min(remaining, readyCount)} videos today (need ${postsPerDay}/day)`);
  if (steps.length === 0) steps.push('All systems go! Run /post-next to see the next video to post.');

  return { checks, summary, steps };
}

// CLI mode
if (require.main === module) {
  const { checks, summary, steps } = runPreflight();
  console.log('\n=== Pre-Flight Check ===\n');
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
    if (c.action) console.log(`     → ${c.action}`);
  }
  console.log(`\n${summary}`);
  console.log('\n--- Next Steps ---');
  steps.forEach(s => console.log(`  ${s}`));
}
