#!/usr/bin/env npx ts-node
/**
 * broadcast-narrator.ts — Sprint 693 (AMD-17)
 *
 * Broadcast narrator agent. Reads recent events (git commits, pipeline stats,
 * gate status) and generates plain-language narrations for Telegram broadcast.
 *
 * Usage:
 *   npx ts-node scripts/scs001/broadcast-narrator.ts                    # generate + send
 *   npx ts-node scripts/scs001/broadcast-narrator.ts --dry-run          # preview only
 *   npx ts-node scripts/scs001/broadcast-narrator.ts --event "Sprint 690 shipped"
 *
 * PM2: kognai-broadcast (cron, fires after each sprint commit)
 * Model: T1 qwen3:4b (local, $0) — simple text transformation
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const BROADCAST_CHAT_ID = process.env.BROADCAST_TELEGRAM_CHAT_ID || process.env.OWNER_TELEGRAM_CHAT_ID || '';
const BROADCAST_DELAY_MS = Math.max(30, parseInt(process.env.BROADCAST_DELAY_SECONDS || '60', 10)) * 1000;
const DRY_RUN = process.argv.includes('--dry-run');
const CUSTOM_EVENT = process.argv.find((_, i, a) => a[i - 1] === '--event') ?? '';

const BROADCAST_LOG = join(ROOT, 'logs', 'broadcast.jsonl');
const LAST_COMMIT_PATH = join(ROOT, 'data', 'broadcast-last-commit.txt');

// ── ACP Filter (AMD-17) ──────────────────────────────────────

function acpFilter(text: string): string {
  return text
    // Strip file paths
    .replace(/[\w/~.]+\.(ts|js|json|md|jsonl|mp4|log)/g, '[file]')
    // Strip raw hashes (keep short prefix)
    .replace(/\b[a-f0-9]{40}\b/g, (m) => m.slice(0, 7))
    // Strip internal agent names (keep public-facing ones)
    .replace(/\b(macgyver|satoshi|elon|guardiola)\b/gi, 'agent')
    // Normalize brand
    .replace(/\bkognai\b/gi, 'Kognai')
    // Strip error traces
    .replace(/Error:.*$/gm, '[error resolved]')
    .replace(/at\s+\w+\s+\(.*\)/g, '')
    // Strip API keys/tokens
    .replace(/[A-Za-z0-9_-]{30,}/g, '[redacted]')
    // Trim whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Event Sources ─────────────────────────────────────────────

interface BroadcastEvent {
  type: 'sprint' | 'pipeline' | 'gate' | 'system';
  raw: string;
  narration: string;
}

function getRecentCommits(since?: string): string[] {
  try {
    const sinceArg = since ? `--since="${since}"` : '-5';
    const out = execSync(`cd ${ROOT} && git log --oneline ${sinceArg} 2>/dev/null`, { timeout: 10000 }).toString();
    return out.trim().split('\n').filter(Boolean);
  } catch { return []; }
}

function getLastBroadcastCommit(): string | null {
  try { return readFileSync(LAST_COMMIT_PATH, 'utf-8').trim(); } catch { return null; }
}

function saveLastBroadcastCommit(hash: string): void {
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(LAST_COMMIT_PATH, hash, 'utf-8');
}

function narrateSprint(commitLine: string): string {
  // Extract sprint info from commit message: "Sprint NNN: BLOCK — description"
  const match = commitLine.match(/Sprint (\d+):\s*(.+)/);
  if (!match) return '';
  const [, num, desc] = match;
  return `Sprint ${num} ships. ${desc.slice(0, 200)}`;
}

function narrateState(commitLine: string): string {
  const match = commitLine.match(/state: update after Sprint (\d+)/);
  if (!match) return '';
  return `State updated after Sprint ${match[1]}.`;
}

function getGateNarration(): string {
  try {
    const gate = JSON.parse(readFileSync(join(ROOT, 'workspace', 'gates', 'phase1-5-gate.json'), 'utf-8'));
    const posts = gate.raw?.posts_count || 0;
    const views = gate.raw?.total_views || 0;
    const days = gate.days_remaining || 0;
    return `Gate progress: ${posts}/30 posts, ${views}/500 views. ${days} days to April 7.`;
  } catch { return ''; }
}

function getPipelineNarration(): string {
  try {
    const stats = JSON.parse(readFileSync(join(ROOT, 'reports', 'stats-latest.json'), 'utf-8'));
    const total = stats.production?.total_videos || 0;
    const queue = stats.queue?.ready_count || 0;
    return `Pipeline: ${total} videos produced, ${queue} in queue.`;
  } catch { return ''; }
}

// ── Broadcast ─────────────────────────────────────────────────

function buildEvents(): BroadcastEvent[] {
  const events: BroadcastEvent[] = [];

  if (CUSTOM_EVENT) {
    events.push({ type: 'system', raw: CUSTOM_EVENT, narration: acpFilter(CUSTOM_EVENT) });
    return events;
  }

  const lastCommit = getLastBroadcastCommit();
  const commits = getRecentCommits();

  // Find new commits since last broadcast
  let newCommits = commits;
  if (lastCommit) {
    const lastIdx = commits.findIndex(c => c.startsWith(lastCommit));
    if (lastIdx > 0) newCommits = commits.slice(0, lastIdx);
    else if (lastIdx === 0) newCommits = []; // No new commits
  }

  for (const commit of newCommits) {
    if (commit.includes('Sprint ') && !commit.includes('state:')) {
      const narration = narrateSprint(commit);
      if (narration) events.push({ type: 'sprint', raw: commit, narration: acpFilter(narration) });
    }
    // Skip state update commits — they're just bookkeeping
  }

  // Add gate narration if there are sprint events
  if (events.length > 0) {
    const gateNarration = getGateNarration();
    if (gateNarration) events.push({ type: 'gate', raw: 'gate-check', narration: gateNarration });
  }

  return events;
}

async function sendBroadcast(text: string): Promise<void> {
  if (!BOT_TOKEN || !BROADCAST_CHAT_ID) {
    console.log('[broadcast] No Telegram credentials — skipping send');
    return;
  }

  const payload = JSON.stringify({ chat_id: BROADCAST_CHAT_ID, text, parse_mode: undefined });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (c: string) => (data += c));
      res.on('end', () => { res.statusCode === 200 ? resolve() : reject(new Error(`Telegram: ${data.slice(0, 200)}`)); });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  console.log('[broadcast] Narrator agent starting...');

  const events = buildEvents();

  if (events.length === 0) {
    console.log('[broadcast] No new events to narrate.');
    return;
  }

  // Combine narrations
  const narration = events.map(e => e.narration).filter(Boolean).join('\n');
  const truncated = narration.length > 1000 ? narration.slice(0, 997) + '...' : narration;

  console.log(`[broadcast] ${events.length} event(s) to narrate:`);
  console.log(truncated);

  if (DRY_RUN) {
    console.log('\n[broadcast] DRY RUN — not sending');
    return;
  }

  // AMD-17: 60-second delay buffer
  console.log(`[broadcast] Delay buffer: ${BROADCAST_DELAY_MS / 1000}s...`);
  await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));

  await sendBroadcast(`📡 Kognai Broadcast\n\n${truncated}`);
  console.log('[broadcast] Sent to Telegram.');

  // Log + save state
  const logEntry = JSON.stringify({ ts: new Date().toISOString(), events: events.length, narration: truncated });
  mkdirSync(join(ROOT, 'logs'), { recursive: true });
  appendFileSync(BROADCAST_LOG, logEntry + '\n');

  // Save last commit hash
  const commits = getRecentCommits();
  if (commits.length > 0) {
    const hash = commits[0].split(' ')[0];
    saveLastBroadcastCommit(hash);
  }
}

main().catch(err => { console.error('[broadcast] Error:', err.message); process.exit(1); });
