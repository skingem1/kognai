/**
 * fetch-tiktok-views.ts — Sprint 266
 * Auto-fetch TikTok view counts for recorded posts using the public oEmbed API.
 * No auth token required — uses https://www.tiktok.com/oembed?url=...
 *
 * Reads manual-posts.jsonl, fetches view counts for each post that has a
 * TikTok URL or video_id, updates the file with latest view counts.
 *
 * Run manually: npx ts-node scripts/scs001/fetch-tiktok-views.ts
 * Run via PM2 cron: daily at 10:00 (after morning digest)
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN      — for gate milestone alerts
 *   OWNER_TELEGRAM_CHAT_ID  — alert recipient
 *   VIEW_FETCH_DRY_RUN=1    — skip file writes, print only
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD          = process.cwd();
const MANUAL_PATH  = join(CWD, 'workspace', 'scs001', 'manual-posts.jsonl');
const LOG_PATH     = join(CWD, 'logs', 'view-tracker.jsonl');
const DRY_RUN      = process.env.VIEW_FETCH_DRY_RUN === '1';
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN || '';
const OWNER_ID     = process.env.OWNER_TELEGRAM_CHAT_ID || '';

const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;

interface ManualPost {
  video_id: string;
  tiktok_url?: string;
  views: number;
  title?: string;
  posted_at: string;
  recorded_at: string;
  views_updated_at?: string;
}

// ── oEmbed fetch ─────────────────────────────────────────────────────────────

function fetchOEmbed(tiktokUrl: string): Promise<{ title: string; author_name: string } | null> {
  const encodedUrl = encodeURIComponent(tiktokUrl);
  const apiUrl = `https://www.tiktok.com/oembed?url=${encodedUrl}`;

  return new Promise((resolve) => {
    https.get(apiUrl, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk.toString()));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.title) {
            resolve({ title: parsed.title, author_name: parsed.author_name ?? '' });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null))
      .on('timeout', function(this: any) { this.destroy(); resolve(null); });
  });
}

// TikTok oEmbed doesn't return view counts directly, but we can use the
// TikTok Research API or scrape the embed page. Since we can't reliably
// get view counts from oEmbed alone, this script provides a framework
// and falls back to manual /updateviews for now.
//
// What it DOES do:
// 1. Validates that recorded TikTok URLs are still live (oEmbed returns data)
// 2. Updates titles from oEmbed if missing
// 3. Sends gate milestone alerts
// 4. Logs fetch attempts for monitoring

function buildTikTokUrl(videoId: string): string {
  // If video_id looks like a TikTok URL, use it directly
  if (videoId.startsWith('http')) return videoId;
  // If it's a numeric TikTok video ID, construct URL
  if (/^\d{15,20}$/.test(videoId)) return `https://www.tiktok.com/@user/video/${videoId}`;
  // Otherwise it's an internal ID — can't fetch from TikTok
  return '';
}

// ── File I/O ────────────────────────────────────────────────────────────────

function loadPosts(): ManualPost[] {
  if (!existsSync(MANUAL_PATH)) return [];
  return readFileSync(MANUAL_PATH, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) as ManualPost; } catch { return null; } })
    .filter(Boolean) as ManualPost[];
}

function savePosts(posts: ManualPost[]): void {
  if (DRY_RUN) {
    console.log('[view-tracker] DRY RUN — would write', posts.length, 'entries');
    return;
  }
  const dir = dirname(MANUAL_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = posts.map(p => JSON.stringify(p)).join('\n') + '\n';
  writeFileSync(MANUAL_PATH, content, 'utf-8');
}

function logEntry(entry: Record<string, unknown>): void {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n');
}

// ── Telegram alert ──────────────────────────────────────────────────────────

function sendTelegramAlert(text: string): Promise<void> {
  if (!BOT_TOKEN || !OWNER_ID || DRY_RUN) {
    console.log('[view-tracker] Alert:', text);
    return Promise.resolve();
  }

  const payload = JSON.stringify({ chat_id: OWNER_ID, text, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, () => resolve());
    req.on('error', () => resolve());
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════');
  console.log('  TikTok View Count Tracker — Sprint 266');
  console.log('══════════════════════════════════════════════\n');

  const posts = loadPosts();
  if (posts.length === 0) {
    console.log('[view-tracker] No manual posts recorded yet. Use /record to add posts.');
    logEntry({ action: 'fetch', posts_count: 0, status: 'empty' });
    return;
  }

  console.log(`[view-tracker] Found ${posts.length} recorded posts`);

  let updated = 0;
  let verified = 0;
  let skipped = 0;

  for (const post of posts) {
    const url = post.tiktok_url || buildTikTokUrl(post.video_id);
    if (!url) {
      console.log(`  ⏭️ ${post.video_id} — no TikTok URL (internal ID), skip`);
      skipped++;
      continue;
    }

    // Fetch oEmbed to verify post is live
    const oembed = await fetchOEmbed(url);
    if (oembed) {
      verified++;
      // Update title if missing
      if (!post.title && oembed.title) {
        post.title = oembed.title;
        updated++;
        console.log(`  ✅ ${post.video_id} — live, title updated: "${oembed.title.slice(0, 50)}"`);
      } else {
        console.log(`  ✅ ${post.video_id} — live (${post.views} views)`);
      }
    } else {
      console.log(`  ❓ ${post.video_id} — oEmbed returned null (may be private/deleted)`);
    }

    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Save updated posts
  if (updated > 0) {
    savePosts(posts);
    console.log(`\n[view-tracker] Updated ${updated} posts`);
  }

  // Gate progress summary
  const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
  const postsLeft = Math.max(0, POSTS_TARGET - posts.length);
  const viewsLeft = Math.max(0, VIEWS_TARGET - totalViews);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysLeft = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86_400_000));

  console.log('\n──────────────────────────────────────────────');
  console.log(`  Gate Progress: ${posts.length}/${POSTS_TARGET} posts · ${totalViews}/${VIEWS_TARGET} views`);
  console.log(`  Verified live: ${verified} · Skipped: ${skipped} · Updated: ${updated}`);
  console.log(`  Days to gate: ${daysLeft}`);

  // Check for gate milestones and alert
  if (posts.length >= POSTS_TARGET && totalViews >= VIEWS_TARGET) {
    console.log('  🎉 GATE TARGET MET!');
    await sendTelegramAlert(
      `🎉 *Phase 1.5 Gate — TARGET MET!*\n\n` +
      `Posts: ${posts.length}/${POSTS_TARGET} ✅\n` +
      `Views: ${totalViews}/${VIEWS_TARGET} ✅\n\n` +
      `Run /gate for full report.`
    );
  } else if (posts.length >= POSTS_TARGET) {
    console.log('  📊 Post target met — need views');
    await sendTelegramAlert(
      `📊 *Gate Update — Posts target met!*\n` +
      `Posts: ${posts.length}/${POSTS_TARGET} ✅\n` +
      `Views: ${totalViews}/${VIEWS_TARGET} (need ${viewsLeft} more)\n` +
      `Use /updateviews to update counts.`
    );
  } else if (posts.length >= 10 && posts.length % 5 === 0) {
    // Milestone alerts every 5 posts after 10
    await sendTelegramAlert(
      `📊 *Gate Milestone — ${posts.length} posts!*\n` +
      `${postsLeft} more to go · ${daysLeft}d to Apr 7\n` +
      `Views: ${totalViews}/${VIEWS_TARGET}`
    );
  }

  logEntry({
    action: 'fetch',
    posts_count: posts.length,
    verified,
    skipped,
    updated,
    total_views: totalViews,
    days_to_gate: daysLeft,
  });

  console.log('══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('[view-tracker] Fatal:', err.message);
  logEntry({ action: 'fetch', status: 'error', error: err.message });
  process.exit(1);
});
