// SCS-001 Manual Post Tracker — Sprint 119
// Records manually-posted TikTok videos and view counts.
// Usage:
//   npx ts-node scripts/scs001/record-manual-post.ts --video-id <id> --views <n> [--title <str>]
//   npx ts-node scripts/scs001/record-manual-post.ts --list

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const MANUAL_POSTS_PATH = resolve('workspace/scs001/manual-posts.jsonl');
const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;

interface ManualPost {
  video_id:    string;
  views:       number;
  title?:      string;
  posted_at:   string;
  recorded_at: string;
}

function loadPosts(): ManualPost[] {
  if (!existsSync(MANUAL_POSTS_PATH)) return [];
  const lines = readFileSync(MANUAL_POSTS_PATH, 'utf-8').split('\n');
  const posts: ManualPost[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { posts.push(JSON.parse(trimmed)); } catch { /* skip corrupt */ }
  }
  return posts;
}

function recordPost(videoId: string, views: number, title?: string): void {
  const dir = dirname(MANUAL_POSTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: ManualPost = {
    video_id:    videoId,
    views,
    title,
    posted_at:   new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
  appendFileSync(MANUAL_POSTS_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  console.log(`\n[ManualPostTracker] Recorded: ${videoId} — ${views} views${title ? ' — ' + title : ''}`);
}

function printStatus(posts: ManualPost[]): void {
  const totalPosts = posts.length;
  const totalViews = posts.reduce((s, p) => s + p.views, 0);
  const avgViews = totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0;

  console.log('\n══════════════════════════════════════════');
  console.log('  SCS-001 Manual Post Tracker — Apr 7 Gate');
  console.log('══════════════════════════════════════════');
  console.log(`  Posts:      ${totalPosts} / ${POSTS_TARGET} ${totalPosts >= POSTS_TARGET ? '✓' : ''}`);
  console.log(`  Total views: ${totalViews} / ${VIEWS_TARGET} target ${totalViews >= VIEWS_TARGET ? '✓' : ''}`);
  console.log(`  Avg views:   ${avgViews} / post`);

  const postsOk = totalPosts >= POSTS_TARGET;
  const viewsOk = totalViews >= VIEWS_TARGET;
  if (postsOk && viewsOk) {
    console.log('\n  GATE STATUS: ✓ ON TRACK — both targets met');
  } else if (postsOk || viewsOk) {
    console.log('\n  GATE STATUS: ⚠ PARTIAL — ' + (!postsOk ? `need ${POSTS_TARGET - totalPosts} more posts` : `need ${VIEWS_TARGET - totalViews} more views`));
  } else {
    console.log(`\n  GATE STATUS: ✗ NOT YET — need ${POSTS_TARGET - totalPosts} posts + ${Math.max(0, VIEWS_TARGET - totalViews)} views`);
  }

  // Cadence needed — Sprint 138
  const APR_7 = new Date('2026-04-07T00:00:00Z');
  const now = new Date();
  const daysToGate = Math.ceil((APR_7.getTime() - now.getTime()) / 86400000);
  const postsRemaining = Math.max(0, POSTS_TARGET - totalPosts);
  if (daysToGate <= 0) {
    console.log('  Cadence needed: GATE DATE PASSED');
  } else {
    const neededPerDay = (postsRemaining / daysToGate).toFixed(1);
    console.log(`  Cadence needed: ${neededPerDay} posts/day (${daysToGate} days to Apr 7 gate)`);
  }
  console.log('══════════════════════════════════════════\n');
}

function printList(posts: ManualPost[]): void {
  if (posts.length === 0) {
    console.log('\n[ManualPostTracker] No manual posts recorded yet.\n');
    return;
  }
  console.log('\n  ID                    Views   Posted At             Title');
  console.log('  ─────────────────────────────────────────────────────────────');
  for (const p of posts) {
    const id = p.video_id.padEnd(22);
    const views = String(p.views).padStart(5);
    const date = p.posted_at.slice(0, 19).replace('T', ' ');
    const title = p.title ? p.title.slice(0, 30) : '';
    console.log(`  ${id} ${views}   ${date}  ${title}`);
  }
}

function parseArgs(): { mode: 'record' | 'list'; videoId?: string; views?: number; title?: string } {
  const args = process.argv.slice(2);
  if (args.includes('--list')) return { mode: 'list' };

  const videoIdIdx = args.indexOf('--video-id');
  const viewsIdx = args.indexOf('--views');
  const titleIdx = args.indexOf('--title');

  if (videoIdIdx === -1 || viewsIdx === -1) {
    console.error('Usage:');
    console.error('  record: npx ts-node scripts/scs001/record-manual-post.ts --video-id <id> --views <n> [--title <str>]');
    console.error('  list:   npx ts-node scripts/scs001/record-manual-post.ts --list');
    process.exit(1);
  }

  return {
    mode: 'record',
    videoId: args[videoIdIdx + 1],
    views: parseInt(args[viewsIdx + 1], 10),
    title: titleIdx !== -1 ? args[titleIdx + 1] : undefined,
  };
}

const opts = parseArgs();
const posts = loadPosts();

if (opts.mode === 'list') {
  printList(posts);
  printStatus(posts);
} else {
  if (!opts.videoId || isNaN(opts.views!)) {
    console.error('[ManualPostTracker] Invalid --video-id or --views argument');
    process.exit(1);
  }
  recordPost(opts.videoId, opts.views!, opts.title);
  const updated = loadPosts();
  printList(updated);
  printStatus(updated);
}
