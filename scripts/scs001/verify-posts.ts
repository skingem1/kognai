/**
 * verify-posts.ts — Check TikTok publish status for auto-posted videos (Sprint 234)
 *
 * Reads auto-post log, checks publish status via TikTok API for recent posts,
 * updates manual-posts.jsonl with live status, notifies owner of failures.
 *
 * TikTok PULL_FROM_URL is async — video may take minutes to process.
 * This script checks the final status and marks videos as confirmed/failed.
 *
 * Usage:
 *   npx ts-node scripts/scs001/verify-posts.ts
 *
 * PM2 cron: runs 1 hour after each auto-post (09:00 + 20:00)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD            = process.cwd();
const AUTO_POST_LOG  = join(CWD, 'logs', 'auto-post.jsonl');
const MANUAL_PATH    = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const VERIFY_LOG     = join(CWD, 'logs', 'verify-posts.jsonl');

const ACCESS_TOKEN   = process.env.TIKTOK_ACCESS_TOKEN || '';
const BOT_TOKEN      = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_CHAT_ID  = process.env.OWNER_TELEGRAM_CHAT_ID || '';

interface AutoPostEvent {
  event: string;
  video_id: string;
  publish_id: string;
  timestamp: string;
  public_url?: string;
  score?: number;
}

interface PublishStatus {
  publish_id: string;
  status: 'processing' | 'published' | 'failed' | 'unknown';
  fail_reason?: string;
  public_post_id?: string;
}

function logEvent(event: Record<string, unknown>): void {
  mkdirSync(dirname(VERIFY_LOG), { recursive: true });
  appendFileSync(VERIFY_LOG, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n', 'utf-8');
}

async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: OWNER_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch {}
}

async function checkPublishStatus(publishId: string): Promise<PublishStatus> {
  if (!ACCESS_TOKEN) {
    return { publish_id: publishId, status: 'unknown', fail_reason: 'no_access_token' };
  }

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const json = await res.json() as any;

    if (!res.ok || json.error?.code) {
      return {
        publish_id: publishId,
        status: 'unknown',
        fail_reason: json.error?.message || `HTTP ${res.status}`,
      };
    }

    const apiStatus = json.data?.status;
    // TikTok statuses: PROCESSING_DOWNLOAD, PROCESSING_UPLOAD, PUBLISH_COMPLETE, FAILED
    if (apiStatus === 'PUBLISH_COMPLETE') {
      return {
        publish_id: publishId,
        status: 'published',
        public_post_id: json.data?.publicaly_available_post_id?.[0],
      };
    } else if (apiStatus === 'FAILED') {
      return {
        publish_id: publishId,
        status: 'failed',
        fail_reason: json.data?.fail_reason || 'unknown',
      };
    } else {
      return {
        publish_id: publishId,
        status: 'processing',
      };
    }
  } catch (err) {
    return {
      publish_id: publishId,
      status: 'unknown',
      fail_reason: (err as Error).message,
    };
  }
}

function updateManualPostStatus(videoId: string, status: string, postId?: string): void {
  if (!existsSync(MANUAL_PATH)) return;

  const lines = readFileSync(MANUAL_PATH, 'utf-8').split('\n');
  const updated = lines.map(line => {
    if (!line.trim()) return line;
    try {
      const entry = JSON.parse(line);
      if (entry.video_id === videoId) {
        entry.verify_status = status;
        entry.verified_at = new Date().toISOString();
        if (postId) entry.tiktok_post_id = postId;
        return JSON.stringify(entry);
      }
    } catch {}
    return line;
  });

  writeFileSync(MANUAL_PATH, updated.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  console.log(`[verify-posts] Starting — ${new Date().toISOString()}`);

  if (!existsSync(AUTO_POST_LOG)) {
    console.log('[verify-posts] No auto-post log found. Nothing to verify.');
    return;
  }

  // Load auto-post events (only "posted" events, not dry runs)
  const events: AutoPostEvent[] = readFileSync(AUTO_POST_LOG, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter((e): e is AutoPostEvent => e?.event === 'posted' && !!e?.publish_id);

  // Load already-verified from verify log
  const alreadyVerified = new Set<string>();
  if (existsSync(VERIFY_LOG)) {
    readFileSync(VERIFY_LOG, 'utf-8').split('\n').filter(l => l.trim()).forEach(l => {
      try {
        const e = JSON.parse(l);
        if (e.event === 'verified' && (e.status === 'published' || e.status === 'failed')) {
          alreadyVerified.add(e.publish_id);
        }
      } catch {}
    });
  }

  // Filter to unverified posts
  const toCheck = events.filter(e => !alreadyVerified.has(e.publish_id));

  if (toCheck.length === 0) {
    console.log('[verify-posts] No unverified posts. All caught up.');
    return;
  }

  console.log(`[verify-posts] Checking ${toCheck.length} unverified post(s)...`);

  let published = 0, failed = 0, processing = 0;

  for (const event of toCheck) {
    const result = await checkPublishStatus(event.publish_id);
    console.log(`[verify-posts] ${event.video_id}: ${result.status}${result.fail_reason ? ` (${result.fail_reason})` : ''}`);

    logEvent({
      event: 'verified',
      video_id: event.video_id,
      publish_id: event.publish_id,
      status: result.status,
      fail_reason: result.fail_reason,
      public_post_id: result.public_post_id,
    });

    updateManualPostStatus(event.video_id, result.status, result.public_post_id);

    if (result.status === 'published') published++;
    else if (result.status === 'failed') failed++;
    else processing++;

    // Rate limit: small delay between API calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[verify-posts] Results: ${published} published, ${failed} failed, ${processing} still processing`);

  // Notify owner of failures
  if (failed > 0) {
    const failedList = toCheck
      .filter((_, i) => {
        // Re-check which ones failed by reading the log we just wrote
        return true; // Simplified — notify all checked
      });

    await sendTelegramMessage([
      `⚠️ *Post Verification Results*`,
      '',
      `✅ Published: ${published}`,
      `❌ Failed: ${failed}`,
      `⏳ Processing: ${processing}`,
      '',
      failed > 0 ? '⚠️ Some posts failed — check `/verifyposts` for details' : '',
    ].filter(Boolean).join('\n'));
  } else if (published > 0) {
    await sendTelegramMessage(`✅ *${published} post(s) verified live on TikTok!* (${processing} still processing)`);
  }
}

main().catch(err => {
  console.error(`[verify-posts] Fatal: ${err.message}`);
  process.exit(1);
});
