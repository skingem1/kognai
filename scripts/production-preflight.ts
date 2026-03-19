#!/usr/bin/env npx ts-node
/**
 * Production Preflight — Sprint 200
 * Comprehensive go-live checklist across all systems.
 * Returns structured results for both CLI and Telegram consumption.
 *
 * Usage:
 *   npx ts-node scripts/production-preflight.ts          # CLI
 *   npx ts-node scripts/production-preflight.ts --json    # JSON output
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

interface Check {
  category: string;
  name: string;
  pass: boolean;
  detail: string;
  action?: string; // what the operator needs to do if failed
}

const checks: Check[] = [];
const ROOT = process.cwd();

function check(category: string, name: string, pass: boolean, detail: string, action?: string) {
  checks.push({ category, name, pass, detail, action: pass ? undefined : action });
}

// ── 1. Environment Variables ────────────────────────────────────────────────

function checkEnv() {
  const required: Array<[string, string, string]> = [
    ['TELEGRAM_BOT_TOKEN', 'Telegram Bot', 'Set up Telegram bot via @BotFather'],
    ['OWNER_TELEGRAM_CHAT_ID', 'Owner Chat ID', 'Get your chat ID from @userinfobot'],
    ['ANTHROPIC_API_KEY', 'Claude API', 'Get API key from console.anthropic.com'],
    ['SUPABASE_URL', 'Supabase', 'Create project at supabase.com'],
    ['SUPABASE_ANON_KEY', 'Supabase Anon Key', 'Get from Supabase dashboard'],
    ['STRIPE_SECRET_KEY', 'Stripe', 'Get from Stripe dashboard > Developers > API keys'],
    ['STRIPE_PRICE_GROWTH', 'Growth Price', 'Create a $19/mo price in Stripe dashboard'],
    ['STRIPE_PRICE_PREMIUM', 'Premium Price', 'Create a $49/mo price in Stripe dashboard'],
  ];

  const optional: Array<[string, string, string]> = [
    ['TIKTOK_ACCESS_TOKEN', 'TikTok API', 'Apply for TikTok API access or post manually'],
    ['ACHIRI_BASE_URL', 'Achiri Remote', 'Deploy Achiri to Hetzner: ./scripts/deploy-achiri.sh'],
    ['OLLAMA_HOST', 'Local AI (Vault)', 'Set Mac Mini Tailscale IP for local model routing'],
  ];

  for (const [key, name, action] of required) {
    const val = process.env[key];
    check('Environment', name, Boolean(val && val.length > 5), val ? 'SET' : 'MISSING', action);
  }

  for (const [key, name, action] of optional) {
    const val = process.env[key];
    check('Environment (optional)', name, Boolean(val && val.length > 5), val ? 'SET' : 'NOT SET', action);
  }
}

// ── 2. Gate Progress ────────────────────────────────────────────────────────

function checkGates() {
  // Sprint 229: Fix path — manual-posts.jsonl is in workspace/scs001/, not data/
  const postsPath = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
  let postCount = 0;
  let totalViews = 0;

  if (existsSync(postsPath)) {
    const lines = readFileSync(postsPath, 'utf-8').trim().split('\n').filter(Boolean);
    postCount = lines.length;
    for (const l of lines) {
      try { totalViews += JSON.parse(l).views || 0; } catch { /* skip */ }
    }
  }

  const daysToGate = Math.ceil((new Date('2026-04-07').getTime() - Date.now()) / 86400000);
  const postsNeeded = Math.max(0, 30 - postCount);
  const viewsNeeded = Math.max(0, 500 - totalViews);

  check('Phase 1.5 Gate (Apr 7)', `Posts: ${postCount}/30`, postCount >= 30, `${postsNeeded} more needed in ${daysToGate} days`,
    `Post ${Math.ceil(postsNeeded / Math.max(daysToGate, 1))}/day: /postnow → save to phone → post to TikTok → /record`);
  check('Phase 1.5 Gate (Apr 7)', `Views: ${totalViews}/500`, totalViews >= 500, `${viewsNeeded} more needed`,
    'Views come from posting. Focus on getting 30 posts up first.');
  check('Phase 1.5 Gate (Apr 7)', `Days remaining: ${daysToGate}`, daysToGate > 7, `${daysToGate} days left`,
    daysToGate <= 7 ? 'CRITICAL: Less than 7 days. Post multiple times daily.' : undefined);
}

// ── 3. Pipeline Status ──────────────────────────────────────────────────────

function checkPipeline() {
  const ledgerPath = join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
  if (existsSync(ledgerPath)) {
    const count = readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean).length;
    check('Pipeline', `Publish ledger: ${count} videos`, count > 0, count > 0 ? `${count} videos ready` : 'Empty',
      'Run the pipeline: ./scripts/run-swarm.sh');
  } else {
    check('Pipeline', 'Publish ledger', false, 'NOT FOUND', 'Run the pipeline first');
  }

  // Check for MP4 files on disk
  try {
    const runDirs = existsSync(join(ROOT, 'workspace', 'scs001'))
      ? execSync(`ls -d ${join(ROOT, 'workspace', 'scs001', 'run-*')} 2>/dev/null || true`, { timeout: 5000 }).toString().trim().split('\n').filter(Boolean)
      : [];
    let mp4Count = 0;
    for (const dir of runDirs) {
      try {
        const files = execSync(`ls ${dir}/caption/*captioned*.mp4 2>/dev/null || true`, { timeout: 3000 }).toString().trim().split('\n').filter(Boolean);
        mp4Count += files.length;
      } catch { /* skip */ }
    }
    check('Pipeline', `Captioned MP4s on disk`, mp4Count > 0, `${mp4Count} found in recent runs`,
      'Run pipeline to generate videos');
  } catch { /* skip */ }
}

// ── 4. PM2 Processes ────────────────────────────────────────────────────────

function checkPM2() {
  try {
    const pm2Out = execSync('pm2 jlist 2>/dev/null', { timeout: 5000 }).toString();
    const procs = JSON.parse(pm2Out);
    const expected = ['telegram-bot', 'kognai-daily-digest', 'kognai-smoke-test', 'kognai-pipeline-watchdog', 'kognai-stripe-webhook', 'achiri-api', 'kognai-auto-post', 'kognai-token-refresh', 'kognai-verify-posts'];

    for (const name of expected) {
      const proc = procs.find((p: any) => p.name === name);
      if (proc) {
        const status = proc.pm2_env?.status;
        check('PM2', name, status === 'online', status || 'unknown',
          status !== 'online' ? `pm2 restart ${name}` : undefined);
      } else {
        check('PM2', name, false, 'NOT RUNNING', `pm2 start ecosystem.config.js --only ${name}`);
      }
    }
  } catch {
    check('PM2', 'PM2 daemon', false, 'NOT AVAILABLE', 'Install PM2: npm i -g pm2 && pm2 start ecosystem.config.js');
  }
}

// ── 5. Achiri Status ────────────────────────────────────────────────────────

function checkAchiri() {
  const achiriUrl = process.env.ACHIRI_BASE_URL || 'http://localhost:3420';
  try {
    const resp = execSync(`curl -s --max-time 3 ${achiriUrl}/health`, { timeout: 5000 }).toString();
    check('Achiri', 'Health endpoint', true, `UP at ${achiriUrl}`);
  } catch {
    check('Achiri', 'Health endpoint', false, `DOWN at ${achiriUrl}`,
      'Deploy Achiri: ./scripts/deploy-achiri.sh');
  }

  const whitelistPath = join(ROOT, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  if (existsSync(whitelistPath)) {
    const count = readFileSync(whitelistPath, 'utf-8').trim().split('\n').filter(Boolean).length;
    check('Achiri', `Alpha whitelist: ${count} users`, count > 0, count > 0 ? `${count} invited` : 'Empty',
      'Invite users: /invite-achiri <chat_id>');
  }

  const waitlistPath = join(ROOT, 'workspace', 'achiri', 'waitlist.jsonl');
  if (existsSync(waitlistPath)) {
    const count = readFileSync(waitlistPath, 'utf-8').trim().split('\n').filter(Boolean).length;
    check('Achiri', `Waitlist: ${count} users`, true, `${count} on waitlist`);
  }
}

// ── 6. Auto-Post Pipeline (Sprint 237) ──────────────────────────────────────

function checkAutoPost() {
  // Token status
  const tokenSet = Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  const tokenMeta = join(ROOT, 'data', 'tiktok-token-meta.json');
  let tokenExpired = false;
  if (tokenSet && existsSync(tokenMeta)) {
    try {
      const meta = JSON.parse(readFileSync(tokenMeta, 'utf-8'));
      tokenExpired = new Date(meta.expires_at) < new Date();
    } catch {}
  }
  check('Auto-Post Pipeline', 'TikTok Access Token',
    tokenSet && !tokenExpired,
    tokenSet ? (tokenExpired ? 'EXPIRED' : 'SET') : 'MISSING',
    tokenSet && tokenExpired
      ? 'npx ts-node scripts/tiktok-refresh-token.ts'
      : !tokenSet
      ? 'npx ts-node scripts/tiktok-oauth.ts (authorize in browser)'
      : undefined);

  // Auto-post log
  const autoPostLog = join(ROOT, 'logs', 'auto-post.jsonl');
  if (existsSync(autoPostLog)) {
    try {
      const lines = readFileSync(autoPostLog, 'utf-8').split('\n').filter(l => l.trim());
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const posted = events.filter((e: any) => e.event === 'posted').length;
      const errors = events.filter((e: any) => e.event === 'error').length;
      check('Auto-Post Pipeline', `Posted: ${posted}, Errors: ${errors}`,
        errors === 0 || posted > errors,
        `${posted} posted, ${errors} errors`,
        errors > 0 ? 'Check logs/auto-post.jsonl for error details' : undefined);
    } catch {}
  } else {
    check('Auto-Post Pipeline', 'Post history', true, 'No posts yet (new pipeline)', undefined);
  }

  // Verify log
  const verifyLog = join(ROOT, 'logs', 'verify-posts.jsonl');
  if (existsSync(verifyLog)) {
    try {
      const lines = readFileSync(verifyLog, 'utf-8').split('\n').filter(l => l.trim());
      const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const published = events.filter((e: any) => e.status === 'published').length;
      const failed = events.filter((e: any) => e.status === 'failed').length;
      check('Auto-Post Pipeline', `Verified: ${published} live, ${failed} failed`,
        failed === 0,
        `${published} confirmed, ${failed} failed`,
        failed > 0 ? 'Check /verifyposts for failure details' : undefined);
    } catch {}
  }

  // Scripts exist
  const scripts = [
    ['scripts/tiktok-oauth.ts', 'OAuth flow'],
    ['scripts/tiktok-refresh-token.ts', 'Token refresh'],
    ['scripts/scs001/auto-post.ts', 'Auto-post daemon'],
    ['scripts/scs001/verify-posts.ts', 'Post verification'],
  ];
  for (const [scriptPath, name] of scripts) {
    check('Auto-Post Pipeline', name, existsSync(join(ROOT, scriptPath)), existsSync(join(ROOT, scriptPath)) ? 'present' : 'MISSING',
      !existsSync(join(ROOT, scriptPath)) ? `File missing: ${scriptPath}` : undefined);
  }
}

// ── Run all checks ──────────────────────────────────────────────────────────

checkEnv();
checkGates();
checkPipeline();
checkPM2();
checkAchiri();
checkAutoPost();

// ── Output ──────────────────────────────────────────────────────────────────

const jsonMode = process.argv.includes('--json');

if (jsonMode) {
  console.log(JSON.stringify({ checks, summary: {
    total: checks.length,
    passed: checks.filter(c => c.pass).length,
    failed: checks.filter(c => !c.pass).length,
    actions: checks.filter(c => c.action).map(c => ({ category: c.category, name: c.name, action: c.action })),
  }}, null, 2));
} else {
  let lastCategory = '';
  for (const c of checks) {
    if (c.category !== lastCategory) {
      console.log(`\n  ${c.category}`);
      lastCategory = c.category;
    }
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
    if (c.action) console.log(`     → ${c.action}`);
  }

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const actions = checks.filter(c => c.action);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Result: ${passed}/${total} checks passed`);
  if (actions.length > 0) {
    console.log(`\n  🔧 Action items for operator (${actions.length}):`);
    actions.forEach((a, i) => console.log(`  ${i + 1}. [${a.category}] ${a.name}: ${a.action}`));
  }
  console.log('='.repeat(50));
}

process.exit(checks.every(c => c.pass) ? 0 : 1);
