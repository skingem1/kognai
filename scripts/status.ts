#!/usr/bin/env ts-node
/**
 * KOGNAI STATUS — Daily Operator Dashboard
 * Sprint 991
 *
 * Shows the current state of all systems at a glance.
 * Run: npx ts-node scripts/status.ts
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const ROOT = process.cwd();
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function ok(s: string) { return c.green + '✓ ' + s + c.reset; }
function warn(s: string) { return c.yellow + '⚠ ' + s + c.reset; }
function fail(s: string) { return c.red + '✗ ' + s + c.reset; }
function heading(s: string) { return c.bold + c.cyan + s + c.reset; }

function daysTo(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - NOW.getTime()) / 86400000);
}

function readJSON<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(join(ROOT, path), 'utf-8')) as T; }
  catch { return null; }
}

function readLines(path: string): string[] {
  try { return readFileSync(join(ROOT, path), 'utf-8').trim().split('\n').filter(Boolean); }
  catch { return []; }
}

function countJSONLLines(path: string): number {
  return readLines(path).filter(l => { try { JSON.parse(l); return true; } catch { return false; } }).length;
}

// ── TikTok Gate ──────────────────────────────────────────────────────────────
function tikTokSection(): void {
  const gate = readJSON<{ raw: { posts_count: number }; days_remaining: number; urgency: string; pace_needed: number }>('workspace/gates/phase1-5-gate.json');
  const posts = gate?.raw?.posts_count ?? 0;
  const daysLeft = gate?.days_remaining ?? daysTo('2026-04-07');
  const pace = gate?.pace_needed ?? ((30 - posts) / Math.max(daysLeft, 1));
  const urgency = gate?.urgency ?? 'UNKNOWN';

  console.log(heading('\n[TikTok Gate — Phase 1.5]'));
  console.log(`  Posts:     ${posts}/30   ${posts >= 30 ? ok('DONE') : posts >= 20 ? warn(`${30-posts} remaining`) : fail(`${30-posts} remaining`)}`);
  console.log(`  Deadline:  Apr 7, 2026   (${daysLeft} days)`);
  console.log(`  Pace:      ${pace.toFixed(1)}/day needed   ${pace <= 2 ? ok('manageable') : warn('pace required')}`);
  console.log(`  Status:    ${urgency === 'ON_TRACK' ? ok('ON TRACK') : urgency === 'CRITICAL' ? fail('CRITICAL') : warn(urgency)}`);

  const token = process.env.TIKTOK_ACCESS_TOKEN;
  console.log(`  API token: ${token ? ok('SET (automated posting enabled)') : fail('NOT SET — manual posting only')}`);
}

// ── Achiri Alpha ─────────────────────────────────────────────────────────────
function achiriSection(): void {
  const readiness = readJSON<{ score: number; overall_ready: boolean; summary: { passed: number; failed: number } }>('reports/achiri-readiness.json');
  const daysLeft = daysTo('2026-04-25');
  const counts = readJSON<Record<string, number>>('workspace/achiri/daily-counts.json');
  const totalUsers = counts ? Object.keys(counts).length : 0;

  console.log(heading('\n[Achiri Alpha — Phase 2A]'));
  console.log(`  Launch:    Apr 25, 2026   (${daysLeft} days)`);
  if (readiness) {
    console.log(`  Readiness: ${readiness.score}/100   ${readiness.overall_ready ? ok(`${readiness.summary.passed} checks PASS`) : fail(`${readiness.summary.failed} checks FAIL`)}`);
  }
  console.log(`  Users:     ${totalUsers} users in daily-counts`);
  const waitlist = countJSONLLines('workspace/achiri/waitlist.jsonl');
  console.log(`  Waitlist:  ${waitlist} users`);
}

// ── Godman Protocols ─────────────────────────────────────────────────────────
function godmanSection(): void {
  const daysLeft = daysTo('2026-04-14');
  const protocols = ['pact', 'lax', 'score', 'signal', 'soul', 'amf', 'drs'];
  const demoScripts = protocols.filter(p => existsSync(join(ROOT, `workspace/spielberg-scripts/${p}-demo.json`)));
  const checklist = existsSync(join(ROOT, 'workspace/godman-protocols/PUBLISH-CHECKLIST.md'));

  console.log(heading('\n[Godman Protocols — April 14 Launch]'));
  console.log(`  Launch:    Apr 14, 2026   (${daysLeft} days)`);
  console.log(`  Protocols: ${protocols.length}/7 implemented   ${ok(protocols.length + '/7')}`);
  console.log(`  Demos:     ${demoScripts.length}/7 scripts ready   ${demoScripts.length === 7 ? ok('all done') : warn(demoScripts.length + '/7')}`);
  console.log(`  Checklist: ${checklist ? ok('PUBLISH-CHECKLIST.md present') : fail('missing')}`);
  console.log(`  npm:       ${fail('NOT YET PUBLISHED — run npm login && npm publish (April 14)')}`);
}

// ── Environment ──────────────────────────────────────────────────────────────
function envSection(): void {
  const critical = [
    ['ANTHROPIC_API_KEY', 'Anthropic (LLM)'],
    ['TELEGRAM_BOT_TOKEN', 'Telegram bot'],
    ['SUPABASE_URL', 'Supabase DB'],
    ['STRIPE_SECRET_KEY', 'Stripe payments'],
    ['TIKTOK_ACCESS_TOKEN', 'TikTok posting'],
    ['ELEVENLABS_API_KEY', 'TTS voice'],
    ['FAL_KEY', 'fal.ai video'],
  ];
  console.log(heading('\n[Environment]'));
  for (const [key, label] of critical) {
    const val = process.env[key];
    const status = val ? ok(label) : (key === 'TIKTOK_ACCESS_TOKEN' ? fail(`${label} — MISSING`) : warn(`${label} — missing`));
    console.log(`  ${key.padEnd(25)} ${status}`);
  }
}

// ── Architecture Systems ──────────────────────────────────────────────────────
function architectureSection(): void {
  console.log(heading('\n[Architecture Systems]'));

  // AMD-25 DKA Store
  const dkaFile = join(ROOT, 'workspace/amd25/.data/dka-entries.jsonl');
  if (existsSync(dkaFile)) {
    const lines = readFileSync(dkaFile, 'utf8').trim().split('\n').filter(Boolean);
    const domains: Record<string, number> = {};
    for (const line of lines) {
      try { const e = JSON.parse(line) as { domain: string }; domains[e.domain] = (domains[e.domain] ?? 0) + 1; } catch {/* skip */}
    }
    const total = Object.values(domains).reduce((a, b) => a + b, 0);
    const summary = Object.entries(domains).map(([d, n]) => `${d}:${n}`).join(' ');
    console.log(`  DKA Store: ${ok(`${total} entries`)} ${summary ? `(${summary})` : ''}`);
  } else {
    console.log(`  DKA Store: ${warn('empty — run: npx tsx workspace/amd25/curator.ts ingest ...')}`);
  }

  // ARCH-001 Observer / Heartbeat
  const hbFile = join(ROOT, 'workspace/arch001/_orchestrator/heartbeat.json');
  if (existsSync(hbFile)) {
    try {
      const hb = JSON.parse(readFileSync(hbFile, 'utf8')) as { ts: string; phase?: string };
      const ageMin = Math.round((Date.now() - new Date(hb.ts).getTime()) / 60_000);
      const status = ageMin < 10 ? ok(`heartbeat ${ageMin}m ago`) : warn(`heartbeat ${ageMin}m ago (stale if >10m)`);
      console.log(`  Observer:  ${status}  phase=${hb.phase ?? 'unknown'}`);
    } catch { console.log(`  Observer:  ${warn('heartbeat.json unreadable')}`); }
  } else {
    console.log(`  Observer:  ${warn('not running — run: bash scripts/arch001/heartbeat.sh')}`);
  }

  // Escalations
  const escalDir = join(ROOT, 'workspace/arch001/_orchestrator/escalations');
  const escals = existsSync(escalDir)
    ? readLines(join(ROOT, 'workspace/arch001/_orchestrator/escalations')).length
    : 0;
  // count files instead
  try {
    const { readdirSync } = require('fs') as typeof import('fs');
    const files = readdirSync(escalDir).filter((f: string) => f.endsWith('.json'));
    console.log(`  Escalations: ${files.length > 0 ? warn(`${files.length} escalation(s) — check workspace/arch001/_orchestrator/escalations/`) : ok('none')}`);
  } catch { console.log(`  Escalations: ${warn('dir unreadable')}`); }
}

// ── Action Items ─────────────────────────────────────────────────────────────
function actionItems(): void {
  const gate = readJSON<{ raw: { posts_count: number }; urgency: string }>('workspace/gates/phase1-5-gate.json');
  const posts = gate?.raw?.posts_count ?? 0;
  const token = process.env.TIKTOK_ACCESS_TOKEN;

  console.log(heading('\n[Action Items]'));
  const items: string[] = [];
  if (!token) items.push('Set TIKTOK_ACCESS_TOKEN in .env (required for automated posting)');
  if (posts < 30) items.push(`Post ${Math.max(1, Math.ceil((30 - posts) / 14))} TikTok video(s) today (${posts}/30 done)`);
  items.push('npm login && publish all 7 Godman protocols before April 14');
  items.push('Record Spielberg demos: npx ts-node scripts/spielberg/batch-run.ts');

  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main(): void {
  console.log(heading(`\n${'═'.repeat(55)}`));
  console.log(heading(`  KOGNAI STATUS — ${TODAY}`));
  console.log(heading(`${'═'.repeat(55)}`));

  tikTokSection();
  achiriSection();
  godmanSection();
  architectureSection();
  envSection();
  actionItems();

  console.log(c.dim + '\nRun: npx ts-node scripts/status.ts' + c.reset + '\n');
}

main();
