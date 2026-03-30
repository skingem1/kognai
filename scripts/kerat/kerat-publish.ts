/**
 * kerat-publish.ts — Ker@ Unified Publisher
 * TICKET-031-A · SCS-005 · 2026-03-30
 *
 * Reads from workspace/kerat/publish-queue.jsonl and routes:
 *   text / thread  → X @keratkognai  (via x-post-utility.ts, prefix='KERAT')
 *   video          → Telegram @keratkognai channel (via kerat-channel.ts)
 *   photo / image  → Telegram @keratkognai channel (via kerat-channel.ts)
 *
 * Writes publish log to workspace/kerat/publish-log.jsonl.
 *
 * Usage:
 *   ts-node scripts/kerat/kerat-publish.ts [--dry-run] [--status] [--all]
 *
 * Queue entry schema:
 *   {
 *     id: string;             // unique ID (e.g. "kerat-001")
 *     type: 'text' | 'thread' | 'video' | 'photo';
 *     content: string;        // tweet text OR caption
 *     tweets?: string[];      // for type='thread'
 *     file_path?: string;     // for type='video' | 'photo'
 *     scheduled_at?: string;  // ISO — skip if in future
 *     created_at: string;     // ISO
 *   }
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

import { postTweet, postThread, getMe } from '../x-post-utility';
import { postText, postVideo, postPhoto, channelHealthCheck } from './kerat-channel';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const QUEUE_PATH = join(ROOT, 'workspace', 'kerat', 'publish-queue.jsonl');
const LOG_PATH   = join(ROOT, 'workspace', 'kerat', 'publish-log.jsonl');

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const DRY_RUN    = process.argv.includes('--dry-run');
const STATUS     = process.argv.includes('--status');
const PUBLISH_ALL = process.argv.includes('--all');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface QueueEntry {
  id: string;
  type: 'text' | 'thread' | 'video' | 'photo';
  content: string;
  tweets?: string[];
  file_path?: string;
  scheduled_at?: string;
  created_at: string;
  published?: boolean;
}

function readQueue(): QueueEntry[] {
  if (!existsSync(QUEUE_PATH)) return [];
  return readFileSync(QUEUE_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean) as QueueEntry[];
}

function getPublishedIds(): Set<string> {
  if (!existsSync(LOG_PATH)) return new Set();
  return new Set(
    readFileSync(LOG_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l).queue_id; } catch { return null; } })
      .filter(Boolean)
  );
}

function writeLog(entry: object): void {
  try {
    appendFileSync(LOG_PATH, JSON.stringify({ ...entry, logged_at: new Date().toISOString() }) + '\n');
  } catch {}
}

function isPastSchedule(entry: QueueEntry): boolean {
  if (!entry.scheduled_at) return true;
  return new Date(entry.scheduled_at) <= new Date();
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function showStatus(): Promise<void> {
  console.log('\n=== Ker@ Publisher Status ===\n');

  // X health
  try {
    const me = await getMe('KERAT');
    console.log(`X (@keratkognai):  ✅  @${me.username}  (id: ${me.id})`);
  } catch (e: any) {
    console.log(`X (@keratkognai):  ❌  ${e.message}`);
  }

  // Telegram health
  const tg = await channelHealthCheck();
  console.log(`Telegram channel:  ${tg.ok ? '✅' : '❌'}  ${tg.channel}  bot: ${tg.bot ?? 'unknown'}`);

  // Queue stats
  const queue = readQueue();
  const published = getPublishedIds();
  const pending = queue.filter(e => !published.has(e.id) && isPastSchedule(e));
  const scheduled = queue.filter(e => !published.has(e.id) && !isPastSchedule(e));

  console.log(`\nQueue:`);
  console.log(`  Total entries:   ${queue.length}`);
  console.log(`  Published:       ${published.size}`);
  console.log(`  Pending (due):   ${pending.length}`);
  console.log(`  Scheduled:       ${scheduled.length}`);
  console.log(`  Queue file:      ${QUEUE_PATH}`);
  console.log(`  Log file:        ${LOG_PATH}`);
}

// ---------------------------------------------------------------------------
// Single-entry publisher
// ---------------------------------------------------------------------------

async function publishEntry(entry: QueueEntry): Promise<{ ok: boolean; detail?: string }> {
  const prefix = 'KERAT';

  switch (entry.type) {
    case 'text': {
      if (DRY_RUN) {
        console.log(`  [dry-run] X text: ${entry.content.slice(0, 80)}…`);
        return { ok: true, detail: 'dry-run' };
      }
      const r = await postTweet(entry.content, undefined, prefix);
      return { ok: true, detail: `tweet_id:${r.id}` };
    }

    case 'thread': {
      const tweets = entry.tweets && entry.tweets.length > 0
        ? entry.tweets
        : [entry.content];
      if (DRY_RUN) {
        console.log(`  [dry-run] X thread (${tweets.length} tweets): ${tweets[0].slice(0, 60)}…`);
        return { ok: true, detail: 'dry-run' };
      }
      const { ids } = await postThread(tweets, prefix);
      return { ok: true, detail: `thread_ids:${ids.join(',')}` };
    }

    case 'video': {
      if (!entry.file_path) return { ok: false, detail: 'missing file_path' };
      if (DRY_RUN) {
        console.log(`  [dry-run] Telegram video: ${entry.file_path}`);
        return { ok: true, detail: 'dry-run' };
      }
      const r = await postVideo(entry.file_path, entry.content || undefined);
      return { ok: true, detail: `message_id:${r.message_id}` };
    }

    case 'photo': {
      if (!entry.file_path) return { ok: false, detail: 'missing file_path' };
      if (DRY_RUN) {
        console.log(`  [dry-run] Telegram photo: ${entry.file_path}`);
        return { ok: true, detail: 'dry-run' };
      }
      const r = await postPhoto(entry.file_path, entry.content || undefined);
      return { ok: true, detail: `message_id:${r.message_id}` };
    }

    default:
      return { ok: false, detail: `unknown type: ${(entry as any).type}` };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (STATUS) {
    await showStatus();
    return;
  }

  console.log(`\n=== Ker@ Publisher ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===\n`);

  const queue = readQueue();
  if (queue.length === 0) {
    console.log('Queue is empty. Add entries to workspace/kerat/publish-queue.jsonl');
    return;
  }

  const published = getPublishedIds();
  const pending = queue.filter(e => !published.has(e.id) && isPastSchedule(e));

  if (pending.length === 0) {
    console.log(`All ${queue.length} queued entries are either published or not yet scheduled.`);
    return;
  }

  const targets = PUBLISH_ALL ? pending : [pending[0]];
  console.log(`Processing ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'} (${pending.length} pending total).\n`);

  let succeeded = 0, failed = 0;

  for (const entry of targets) {
    const platform = (entry.type === 'video' || entry.type === 'photo') ? 'Telegram' : 'X';
    console.log(`[${entry.id}] ${entry.type.toUpperCase()} → ${platform}`);

    try {
      const result = await publishEntry(entry);
      if (result.ok) {
        succeeded++;
        console.log(`  ✅  ${result.detail}`);
        writeLog({ queue_id: entry.id, type: entry.type, platform, success: true, detail: result.detail });
      } else {
        failed++;
        console.log(`  ❌  ${result.detail}`);
        writeLog({ queue_id: entry.id, type: entry.type, platform, success: false, detail: result.detail });
      }
    } catch (err: any) {
      failed++;
      console.log(`  ❌  EXCEPTION: ${err.message}`);
      writeLog({ queue_id: entry.id, type: entry.type, platform, success: false, detail: err.message });
    }
  }

  console.log(`\n--- Done: ${succeeded} published, ${failed} failed ---`);
}

export { main as keratPublish, showStatus, publishEntry };

main().catch(e => { console.error(`Fatal: ${e.message}`); process.exit(1); });
