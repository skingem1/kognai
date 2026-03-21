/**
 * posting-readiness-gate.ts — Sprint 724
 *
 * Comprehensive Phase 1.5 posting readiness gate.
 * Checks all prerequisites for hitting the 30-post target by April 7.
 *
 * Dimensions checked:
 *   1. TikTok credentials (client key, secret, access token)
 *   2. Content inventory (videos ready to post)
 *   3. Gate timeline (days remaining, posts/day needed)
 *   4. Pipeline health (PM2 processes running)
 *
 * Usage:
 *   npx ts-node scripts/scs001/posting-readiness-gate.ts
 *
 * Telegram: /readiness
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
config({ path: join(ROOT, '.env') });

const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const GATE_TARGET = 30;

interface Dimension {
  name: string;
  status: 'green' | 'yellow' | 'red';
  summary: string;
  details: string[];
}

function checkCredentials(): Dimension {
  const hasKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  const details: string[] = [];

  if (!hasKey) details.push('Missing: TIKTOK_CLIENT_KEY');
  if (!hasSecret) details.push('Missing: TIKTOK_CLIENT_SECRET');
  if (!hasToken) details.push('Missing: TIKTOK_ACCESS_TOKEN → run scripts/tiktok-oauth.ts');

  const allSet = hasKey && hasSecret && hasToken;
  const partial = hasKey && hasSecret;

  return {
    name: 'TikTok Credentials',
    status: allSet ? 'green' : partial ? 'yellow' : 'red',
    summary: allSet ? 'All credentials set' : partial ? 'Access token needed' : 'Credentials missing',
    details: details.length ? details : ['All credentials configured'],
  };
}

function checkContentInventory(): Dimension {
  const details: string[] = [];
  let readyCount = 0;

  // Check video inventory report
  const invPath = join(ROOT, 'reports', 'video-inventory.json');
  if (existsSync(invPath)) {
    try {
      const inv = JSON.parse(readFileSync(invPath, 'utf-8'));
      readyCount = inv.ready_to_post ?? 0;
      details.push(`${readyCount} videos ready to post`);
      details.push(`${inv.unique_topics ?? 0} unique topics covered`);
    } catch {
      details.push('Could not parse video-inventory.json');
    }
  }

  // Check multiformat runs
  const mfDir = join(ROOT, 'workspace', 'scs001', 'multiformat-runs');
  if (existsSync(mfDir)) {
    const runs = readdirSync(mfDir).filter(d => d.startsWith('mf-'));
    details.push(`${runs.length} multiformat runs completed`);
  }

  const sufficient = readyCount >= GATE_TARGET;
  const partial = readyCount >= 10;

  return {
    name: 'Content Inventory',
    status: sufficient ? 'green' : partial ? 'yellow' : 'red',
    summary: `${readyCount}/${GATE_TARGET} videos ready`,
    details,
  };
}

function checkGateTimeline(): Dimension {
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86400000));
  const postsNeeded = GATE_TARGET; // assume 0 posted so far
  const postsPerDay = daysLeft > 0 ? Math.ceil(postsNeeded / daysLeft) : Infinity;

  // Check publish ledger for actual posts
  let postedCount = 0;
  const ledgerPath = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  if (existsSync(ledgerPath)) {
    const lines = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    postedCount = lines.length;
  }

  const remaining = Math.max(0, GATE_TARGET - postedCount);
  const actualPerDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : Infinity;

  const details = [
    `${daysLeft} days until April 7 gate`,
    `${postedCount}/${GATE_TARGET} posts completed`,
    `${remaining} posts remaining`,
    actualPerDay <= 2 ? `${actualPerDay} post/day needed — achievable` : `${actualPerDay} posts/day needed — aggressive`,
  ];

  const onTrack = remaining === 0;
  const feasible = actualPerDay <= 3;

  return {
    name: 'Gate Timeline',
    status: onTrack ? 'green' : feasible ? 'yellow' : 'red',
    summary: `${postedCount}/${GATE_TARGET} posted · ${daysLeft}d left`,
    details,
  };
}

function checkPipelineHealth(): Dimension {
  const details: string[] = [];
  let pm2Running = false;

  try {
    const pm2Output = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    const processes = JSON.parse(pm2Output);
    const kognaiProcs = processes.filter((p: any) => p.name?.startsWith('scs001') || p.name?.startsWith('kognai'));
    pm2Running = kognaiProcs.length > 0;
    // cron_restart processes show as "stopped" between runs — this is normal
    const online = kognaiProcs.filter((p: any) => p.pm2_env?.status === 'online');
    const cronStopped = kognaiProcs.filter((p: any) => p.pm2_env?.status === 'stopped' && p.pm2_env?.cron_restart);
    const errored = kognaiProcs.filter((p: any) => p.pm2_env?.status === 'errored');
    details.push(`${online.length} online, ${cronStopped.length} cron (waiting), ${errored.length} errored`);
    if (errored.length > 0) {
      for (const p of errored) details.push(`  ERRORED: ${p.name}`);
    }
  } catch {
    details.push('PM2 not available or no processes');
  }

  return {
    name: 'Pipeline Health',
    status: pm2Running ? 'green' : 'yellow',
    summary: pm2Running ? 'PM2 processes running' : 'No PM2 processes detected',
    details: details.length ? details : ['No kognai processes found'],
  };
}

function main() {
  console.log('=== Phase 1.5 Posting Readiness Gate ===\n');

  const dimensions = [
    checkCredentials(),
    checkContentInventory(),
    checkGateTimeline(),
    checkPipelineHealth(),
  ];

  const statusIcon = { green: '🟢', yellow: '🟡', red: '🔴' };

  for (const d of dimensions) {
    console.log(`${statusIcon[d.status]} ${d.name}: ${d.summary}`);
    for (const detail of d.details) {
      console.log(`   ${detail}`);
    }
    console.log();
  }

  const redCount = dimensions.filter(d => d.status === 'red').length;
  const yellowCount = dimensions.filter(d => d.status === 'yellow').length;

  if (redCount === 0 && yellowCount === 0) {
    console.log('✅ GATE READY — all dimensions green');
  } else if (redCount === 0) {
    console.log(`⚠️  GATE PARTIAL — ${yellowCount} dimension(s) need attention`);
  } else {
    console.log(`❌ GATE BLOCKED — ${redCount} critical issue(s)`);
  }

  // Output JSON for programmatic consumption
  const report = {
    gate: 'phase-1.5',
    target_date: '2026-04-07',
    target_posts: GATE_TARGET,
    checked_at: new Date().toISOString(),
    dimensions: dimensions.map(d => ({ name: d.name, status: d.status, summary: d.summary })),
    overall: redCount > 0 ? 'blocked' : yellowCount > 0 ? 'partial' : 'ready',
  };
  console.log('\n--- JSON Report ---');
  console.log(JSON.stringify(report, null, 2));
}

main();
