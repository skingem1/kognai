#!/usr/bin/env npx ts-node
/**
 * gate-urgency-alert.ts — Sprint 311
 * Sends a daily gate urgency alert to operator via Telegram.
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
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const MANUAL_POSTS_PATH = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
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
  return readFileSync(MANUAL_POSTS_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as ManualPost[];
}

function getUrgencyEmoji(daysLeft: number, postsLeft: number): string {
  if (postsLeft <= 0) return '✅';
  if (daysLeft <= 3) return '🔴';
  if (daysLeft <= 7) return '🟠';
  if (daysLeft <= 14) return '🟡';
  return '🟢';
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
  const posts = loadPosts();
  const postsCount = posts.length;
  const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - Date.now()) / 86_400_000));
  const postsLeft = Math.max(0, POSTS_TARGET - postsCount);
  const viewsLeft = Math.max(0, VIEWS_TARGET - totalViews);
  const paceNeeded = daysLeft > 0 && postsLeft > 0 ? Math.round(postsLeft / daysLeft * 10) / 10 : 0;
  const emoji = getUrgencyEmoji(daysLeft, postsLeft);

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
  } else if (daysLeft <= 7 && postsLeft > 0) {
    lines.push('', '🟠 *CRITICAL* — behind pace, increase posting frequency');
  }

  // Action items
  const actions: string[] = [];
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    actions.push('• Set `TIKTOK\\_ACCESS\\_TOKEN` in .env');
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
