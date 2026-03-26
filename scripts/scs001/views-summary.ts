/**
 * views-summary.ts — Sprint 1451
 * Shows TikTok views distribution across manual-posts.jsonl.
 * Tells the user how many posts need URLs for views tracking.
 *
 * Usage:
 *   npx ts-node scripts/scs001/views-summary.ts
 *   npx ts-node scripts/scs001/views-summary.ts --json
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT       = path.resolve(__dirname, '../..');
const POSTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const JSON_FLAG  = process.argv.includes('--json');

function readPosts(): any[] {
  if (!fs.existsSync(POSTS_PATH)) return [];
  return fs.readFileSync(POSTS_PATH, 'utf-8').split('\n')
    .filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

const posts = readPosts();
const total      = posts.length;
const withUrl    = posts.filter(p => p.tiktok_url).length;
const withViews  = posts.filter(p => (p.views ?? 0) > 0).length;
const totalViews = posts.reduce((s, p) => s + (p.views ?? 0), 0);
const missing    = total - withUrl;

const top5 = [...posts]
  .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
  .slice(0, 5)
  .filter(p => (p.views ?? 0) > 0);

if (JSON_FLAG) {
  console.log(JSON.stringify({ total, with_url: withUrl, with_views: withViews, total_views: totalViews, missing_url: missing, top5 }, null, 2));
  process.exit(0);
}

console.log('\n=== TikTok Views Summary ===');
console.log(`  Total posts:        ${total}`);
console.log(`  Posts with URL:     ${withUrl}`);
console.log(`  Posts with views:   ${withViews}`);
console.log(`  Total views:        ${totalViews}`);
console.log(`  Views target:       500`);
console.log(`  Views gap:          ${Math.max(0, 500 - totalViews)}`);
console.log('');

if (missing > 0) {
  console.log(`⚠  ${missing} posts missing tiktok_url — views untrackable for those.`);
  console.log(`   To fix: npx ts-node scripts/scs001/record-post-url.ts --url=<tiktok_url>`);
  console.log(`   (omit --video-id to update the latest unrecorded post)`);
} else {
  console.log('✓  All posts have tiktok_url set.');
}

if (top5.length > 0) {
  console.log('\n  Top posts by views:');
  top5.forEach(p => {
    console.log(`    [${p.video_id}] ${p.views} views${p.tiktok_url ? ' ✓' : ''}`);
  });
}
console.log('');
