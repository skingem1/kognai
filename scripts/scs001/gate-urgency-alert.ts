#!/usr/bin/env npx ts-node
/**
 * gate-urgency-alert.ts — Sprint 345
 * Sends a daily gate urgency alert to operator via Telegram.
 * Auto-regenerates the gate report (phase1-5-gate.json) before sending.
 *
 * Reads manual-posts.jsonl, computes countdown to Apr 7 kill switch,
 * and sends a formatted Telegram message with urgency level.
 *
 * Designed to run as PM2 cron (daily at 09:00):
 *   pm2 start scripts/scs001/gate-urgency-alert.ts --name gate-alert --cron "0 9 * * *" --no-autorestart
 *
 * Usage: npx ts-node scripts/scs001/gate-urgency-alert.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const MANUAL_POSTS_PATH = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

const GATE_DATE = new Date('2026-04-07T00:00:00Z');
const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;

interface ManualPost {
  video_id: string;
  views: number;
  title?: string;
  posted_at: string;
}

function loadPosts(): ManualPost[] {
  if (!existsSync(MANUAL_POSTS_PATH)) return [];
  // Sprint 1353: Filter dry-run posts — gate requires real TikTok posts only
  const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  return readFileSync(MANUAL_POSTS_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .filter((e: any) => !e.method || !DRY_METHODS.some(d => String(e.method).includes(d))) as ManualPost[];
}

function getUrgencyEmoji(daysLeft: number, postsLeft: number, postsCount: number): string {
  if (postsLeft <= 0) return '✅';
  if (daysLeft <= 3) return '🔴';
  if (daysLeft <= 7) return '🟠';
  if (postsCount === 0) return '🟡';   // Sprint 356: WARNING when 0 posts
  if (daysLeft <= 14) return '🟡';
  return '🟢';
}

// Sprint 356: Load top-3 queue videos for inline display
function getTop3Queue(): { videoId: string; viralScore: number | null }[] {
  const ledgerPath = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
  const manualPath = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
  const expPath = join(CWD, 'workspace', 'scs001', 'experiments.jsonl');

  if (!existsSync(ledgerPath)) return [];

  const postedIds = new Set<string>();
  if (existsSync(manualPath)) {
    for (const line of readFileSync(manualPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e.video_id) postedIds.add(e.video_id); } catch {}
    }
  }

  const viralScores = new Map<string, number>();
  if (existsSync(expPath)) {
    for (const line of readFileSync(expPath, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        const id = e.clip_id ?? e.video_id;
        if (id && e.partial_viral_score != null) viralScores.set(id, e.partial_viral_score);
      } catch {}
    }
  }

  const unposted: { videoId: string; viralScore: number | null }[] = [];
  for (const line of readFileSync(ledgerPath, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.video_id && !postedIds.has(e.video_id)) {
        unposted.push({ videoId: e.video_id, viralScore: viralScores.get(e.video_id) ?? null });
      }
    } catch {}
  }

  unposted.sort((a, b) => (b.viralScore ?? -1) - (a.viralScore ?? -1));
  return unposted.slice(0, 3);
}

async function sendTelegram(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) {
    console.log('Telegram not configured — printing to console only');
    console.log(text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: OWNER_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  });
  if (!res.ok) {
    console.error(`Telegram send failed: ${res.status} ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  // Auto-regenerate gate report before sending alert
  const gateScript = join(CWD, 'scripts', 'scs001', 'generate-phase1-5-gate.ts');
  if (existsSync(gateScript)) {
    try {
      console.log('[gate-alert] Regenerating gate report...');
      execSync(`npx ts-node "${gateScript}"`, { cwd: CWD, timeout: 30_000, stdio: 'pipe' });
      console.log('[gate-alert] Gate report regenerated.');
    } catch (e: any) {
      console.warn(`[gate-alert] Gate regen failed (non-blocking): ${e.message}`);
    }
  }

  // Load gate report status for inline display
  const gatePath = join(CWD, 'workspace', 'gates', 'phase1-5-gate.json');
  let gateVerdict = '';
  if (existsSync(gatePath)) {
    try {
      const gate = JSON.parse(readFileSync(gatePath, 'utf-8'));
      gateVerdict = `📄 Gate report: *${gate.recommendation ?? gate.urgency ?? 'N/A'}* — ${gate.urgency_signal ?? ''}`;
    } catch { /* ignore */ }
  }

  const posts = loadPosts();
  const postsCount = posts.length;
  const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, POSTS_TARGET - postsCount);
  const viewsLeft = Math.max(0, VIEWS_TARGET - totalViews);
  const paceNeeded = daysLeft > 0 && postsLeft > 0 ? Math.round(postsLeft / daysLeft * 10) / 10 : 0;
  const emoji = getUrgencyEmoji(daysLeft, postsLeft, postsCount);

  const lines: string[] = [
    `${emoji} *Phase 1.5 Gate — Daily Alert*`,
    '',
    `📅 *Deadline:* Apr 7 (${daysLeft} days left)`,
    `📊 *Posts:* ${postsCount}/${POSTS_TARGET} ${postsLeft > 0 ? `(${postsLeft} more needed)` : '✅'}`,
    `👁 *Views:* ${totalViews}/${VIEWS_TARGET} ${viewsLeft > 0 ? `(${viewsLeft} more needed)` : '✅'}`,
  ];

  if (postsLeft > 0 && daysLeft > 0) {
    lines.push(`⏱ *Pace needed:* ${paceNeeded} posts/day`);
  }

  if (postsLeft <= 0 && viewsLeft <= 0) {
    lines.push('', '✅ *Gate criteria MET* — ready for Phase 2A');
  } else if (daysLeft <= 3 && postsLeft > 0) {
    lines.push('', '🔴 *KILL SWITCH IMMINENT* — post NOW or TikTok agent shuts down');
  } else if (postsCount === 0) {
    lines.push('', '🟡 *WARNING* — 0 posts recorded. Start posting to avoid gate failure');
  } else if (daysLeft <= 7 && postsLeft > 0) {
    lines.push('', '🟠 *CRITICAL* — behind pace, increase posting frequency');
  }

  // Sprint 776: Show next 3 videos from curated post queue manifest
  const manifestPath = join(CWD, 'workspace', 'scs001', 'manual-post-queue', 'post-manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const unposted = (manifest.videos ?? []).filter((v: any) => !v.posted);
      if (unposted.length > 0) {
        lines.push('', '🎬 *Next to post (curated queue):*');
        for (const v of unposted.slice(0, 3)) {
          const fmt = (v.format ?? '').toUpperCase();
          const topic = (v.topic ?? '').slice(0, 50);
          lines.push(`  ${v.order}. [${fmt}] ${topic}`);
        }
        lines.push(`  _(${unposted.length} total in queue)_`);
      }
    } catch { /* ignore */ }
  } else {
    // Fallback: Sprint 356 top-3 from ledger
    const top3 = getTop3Queue();
    if (top3.length > 0) {
      lines.push('', '🎬 *Top 3 ready to post:*');
      for (let i = 0; i < top3.length; i++) {
        const v = top3[i];
        const vs = v.viralScore != null ? ` 🧬${v.viralScore}` : '';
        lines.push(`  ${i + 1}. \`${v.videoId}\`${vs}`);
      }
    }
  }

  // Queue count
  const ledgerPath = join(CWD, 'workspace', 'scs001', 'publish-ledger.jsonl');
  let queueCount = 0;
  const postedIds = new Set(posts.map(p => p.video_id).filter(Boolean));
  if (existsSync(ledgerPath)) {
    const ledgerLines = readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const l of ledgerLines) {
      try { const e = JSON.parse(l); if (e.video_id && !postedIds.has(e.video_id)) queueCount++; } catch {}
    }
  }
  // Sprint 824: Show unique ready-to-post count from inventory
  const invPath = join(CWD, 'reports', 'video-inventory.json');
  let readyToPost = 0;
  if (existsSync(invPath)) {
    try { readyToPost = JSON.parse(readFileSync(invPath, 'utf-8')).ready_to_post ?? 0; } catch {}
  }
  lines.push(`📦 *Inventory:* ${readyToPost} unique videos ready to post`);
  if (readyToPost >= POSTS_TARGET && postsLeft > 0) {
    lines.push(`✅ *Content ready for full gate* — post ${postsLeft} more to pass`);
  }
  if (readyToPost === 0) {
    lines.push('⚠️ *No content* — run /produce or /produce-topic to generate');
  }

  if (gateVerdict) lines.push(gateVerdict);

  // Stripe readiness check
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_PORT'];
  const stripeMissing = stripeKeys.filter(k => !process.env[k]);
  const stripeReady = stripeMissing.length === 0;

  lines.push('', `💳 *Stripe:* ${stripeReady ? '✅ Ready' : '❌ Not Ready'}`);
  if (!stripeReady) {
    lines.push(`   Missing: ${stripeMissing.map(k => `\`${k.replace(/_/g, '\\_')}\``).join(', ')}`);
  }

  // Action items
  const actions: string[] = [];
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    actions.push('• Set `TIKTOK\\_ACCESS\\_TOKEN` in .env');
  }
  if (!stripeReady) {
    actions.push('• Configure Stripe env vars for payment processing');
  }
  if (postsLeft > 0) {
    actions.push(`• Post ${Math.min(postsLeft, 3)} videos today`);
    actions.push('• Use `/record` after each manual post');
  }
  if (actions.length > 0) {
    lines.push('', '*Action items:*', ...actions);
  }

  const message = lines.join('\n');
  console.log(message);
  await sendTelegram(message);
}

main().catch(e => { console.error(e); process.exit(1); });
