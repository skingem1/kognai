/**
 * validate-e2e-pipeline.ts — End-to-End Pipeline Smoke Test
 * Sprint 1232 / E2E-SMOKE
 *
 * Validates the full operator posting workflow:
 *   1. Script inventory (are there scripts ready to post?)
 *   2. Publish ledger integrity
 *   3. Export files present
 *   4. Reports freshness (posting-health, stats, analytics)
 *   5. Gate status (Apr 7 deadline)
 *   6. PM2 processes running
 *   7. Telegram bot config present
 *   8. TikTok credentials check
 *
 * Run: npx tsx scripts/scs001/validate-e2e-pipeline.ts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

try { require('dotenv').config({ path: join(__dirname, '..', '..', '.env') }); } catch {}

const ROOT = join(__dirname, '..', '..');
const SCS = join(ROOT, 'workspace', 'scs001');

interface Check {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

const checks: Check[] = [];

function check(name: string, fn: () => { status: 'PASS' | 'FAIL' | 'WARN'; detail: string }): void {
  try {
    const result = fn();
    checks.push({ name, ...result });
  } catch (e) {
    checks.push({ name, status: 'FAIL', detail: `Error: ${(e as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// 1. Script inventory
// ---------------------------------------------------------------------------
check('Script inventory', () => {
  const scriptsDir = join(SCS, 'scripts');
  if (!existsSync(scriptsDir)) return { status: 'FAIL', detail: 'scripts/ directory missing' };
  const files = readdirSync(scriptsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return { status: 'FAIL', detail: 'No script JSON files found' };
  return { status: files.length >= 5 ? 'PASS' : 'WARN', detail: `${files.length} scripts available` };
});

// ---------------------------------------------------------------------------
// 2. Publish ledger integrity
// ---------------------------------------------------------------------------
check('Publish ledger', () => {
  const ledger = join(SCS, 'publish-ledger.jsonl');
  if (!existsSync(ledger)) return { status: 'WARN', detail: 'Ledger not found (new pipeline?)' };
  const lines = readFileSync(ledger, 'utf-8').split('\n').filter(l => l.trim());
  let valid = 0;
  let invalid = 0;
  for (const line of lines) {
    try { JSON.parse(line); valid++; } catch { invalid++; }
  }
  if (invalid > 0) return { status: 'WARN', detail: `${valid} valid, ${invalid} malformed entries` };
  return { status: 'PASS', detail: `${valid} entries, all valid JSON` };
});

// ---------------------------------------------------------------------------
// 3. Export files
// ---------------------------------------------------------------------------
check('Export files', () => {
  const exportList = join(SCS, 'export-files.txt');
  if (!existsSync(exportList)) return { status: 'WARN', detail: 'export-files.txt not found' };
  const lines = readFileSync(exportList, 'utf-8').split('\n').filter(l => l.trim());
  return { status: lines.length > 0 ? 'PASS' : 'WARN', detail: `${lines.length} files in export manifest` };
});

// ---------------------------------------------------------------------------
// 4. Reports freshness
// ---------------------------------------------------------------------------
check('Reports freshness', () => {
  const reports = ['posting-health.json', 'stats-latest.json', 'achiri-analytics.json'];
  const stale: string[] = [];
  const fresh: string[] = [];
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  for (const r of reports) {
    const path = join(ROOT, 'reports', r);
    if (!existsSync(path)) { stale.push(r + ' (missing)'); continue; }
    const mtime = statSync(path).mtimeMs;
    if (mtime < oneDayAgo) stale.push(r); else fresh.push(r);
  }

  if (stale.length > 0) return { status: 'WARN', detail: `Fresh: ${fresh.length}, Stale: ${stale.join(', ')}` };
  return { status: 'PASS', detail: `All ${fresh.length} reports fresh (<24h)` };
});

// ---------------------------------------------------------------------------
// 5. Gate status
// ---------------------------------------------------------------------------
check('Gate status (Apr 7)', () => {
  const gateFile = join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json');
  if (!existsSync(gateFile)) return { status: 'WARN', detail: 'Gate file not found' };
  try {
    const gate = JSON.parse(readFileSync(gateFile, 'utf-8'));
    const deadline = new Date('2026-04-07');
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const posts = gate.current_posts ?? gate.posts ?? 0;
    return {
      status: posts >= 30 ? 'PASS' : (daysLeft < 7 ? 'FAIL' : 'WARN'),
      detail: `${posts}/30 posts, ${daysLeft} days until Apr 7 deadline`,
    };
  } catch {
    return { status: 'WARN', detail: 'Gate file unreadable' };
  }
});

// ---------------------------------------------------------------------------
// 6. PM2 processes
// ---------------------------------------------------------------------------
check('PM2 processes', () => {
  try {
    const output = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(output) as Array<{ name: string; pm2_env: { status: string } }>;
    const scsProcs = procs.filter(p => p.name.startsWith('scs001'));
    const running = scsProcs.filter(p => p.pm2_env.status === 'online');
    if (scsProcs.length === 0) return { status: 'WARN', detail: 'No SCS-001 PM2 processes found' };
    return {
      status: running.length === scsProcs.length ? 'PASS' : 'WARN',
      detail: `${running.length}/${scsProcs.length} SCS-001 processes online`,
    };
  } catch {
    return { status: 'WARN', detail: 'PM2 not available or no processes' };
  }
});

// ---------------------------------------------------------------------------
// 7. Telegram bot config
// ---------------------------------------------------------------------------
check('Telegram bot config', () => {
  const hasToken = !!process.env['TELEGRAM_BOT_TOKEN'];
  const hasChatId = !!process.env['OWNER_TELEGRAM_CHAT_ID'];
  if (hasToken && hasChatId) return { status: 'PASS', detail: 'Bot token + chat ID set' };
  const missing = [];
  if (!hasToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!hasChatId) missing.push('OWNER_TELEGRAM_CHAT_ID');
  return { status: 'WARN', detail: `Missing: ${missing.join(', ')}` };
});

// ---------------------------------------------------------------------------
// 8. TikTok credentials
// ---------------------------------------------------------------------------
check('TikTok credentials', () => {
  const hasKey = !!process.env['TIKTOK_CLIENT_KEY'];
  const hasSecret = !!process.env['TIKTOK_CLIENT_SECRET'];
  const hasToken = !!process.env['TIKTOK_ACCESS_TOKEN'];
  if (hasKey && hasSecret && hasToken) return { status: 'PASS', detail: 'All TikTok credentials set' };
  if (hasKey && hasSecret) return { status: 'WARN', detail: 'Client key+secret set, ACCESS_TOKEN missing (manual posting only)' };
  return { status: 'FAIL', detail: 'TikTok credentials missing' };
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n━━━ E2E Pipeline Smoke Test ━━━\n');

let passCount = 0;
let failCount = 0;
let warnCount = 0;

for (const c of checks) {
  const icon = c.status === 'PASS' ? '✓' : c.status === 'FAIL' ? '✗' : '⚠';
  console.log(`  ${icon} ${c.name}: ${c.detail}`);
  if (c.status === 'PASS') passCount++;
  else if (c.status === 'FAIL') failCount++;
  else warnCount++;
}

console.log(`\n━━━ Result: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL ━━━\n`);

if (failCount > 0) {
  console.log('❌ PIPELINE NOT READY — fix FAIL items before posting');
  process.exit(1);
} else if (warnCount > 0) {
  console.log('⚠ PIPELINE READY WITH WARNINGS — manual posting possible');
} else {
  console.log('✅ PIPELINE FULLY READY');
}
