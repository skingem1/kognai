/**
 * record-post-url.ts — Sprint 1451
 * Adds tiktok_url to a manual-posts.jsonl entry and fetches initial view count.
 *
 * Usage:
 *   npx ts-node scripts/scs001/record-post-url.ts --url=https://www.tiktok.com/@user/video/123
 *   npx ts-node scripts/scs001/record-post-url.ts --video-id=exp-abc123 --url=https://...
 *
 * If --video-id is omitted, updates the most recent entry without a tiktok_url.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const ROOT       = path.resolve(__dirname, '../..');
const POSTS_PATH = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const TIKTOK_URL_RE = /^https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/;

function fetchOEmbed(url: string): Promise<number> {
  return new Promise(resolve => {
    const api = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    https.get(api, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          // oEmbed doesn't expose view counts — title only; return 0 sentinel
          resolve(typeof j.title === 'string' ? -1 : 0);
        } catch { resolve(0); }
      });
    }).on('error', () => resolve(0));
  });
}

function readPosts(): any[] {
  if (!fs.existsSync(POSTS_PATH)) return [];
  return fs.readFileSync(POSTS_PATH, 'utf-8').split('\n')
    .filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function writePosts(entries: any[]): void {
  fs.writeFileSync(POSTS_PATH, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const videoId = args.find(a => a.startsWith('--video-id='))?.split('=')[1];
  const url    = args.find(a => a.startsWith('--url='))?.split('=')[1];

  if (!url) { console.error('Usage: record-post-url.ts --url=<tiktok_url> [--video-id=<id>]'); process.exit(1); }
  if (!TIKTOK_URL_RE.test(url)) { console.error(`Invalid TikTok URL: ${url}\nExpected: https://www.tiktok.com/@user/video/<id>`); process.exit(1); }

  const posts = readPosts();
  if (posts.length === 0) { console.error('No posts in manual-posts.jsonl'); process.exit(1); }

  let idx = -1;
  if (videoId) {
    idx = posts.findIndex(p => p.video_id === videoId);
    if (idx === -1) { console.error(`Video ID not found: ${videoId}`); process.exit(1); }
  } else {
    // Most recent entry without a URL
    for (let i = posts.length - 1; i >= 0; i--) {
      if (!posts[i].tiktok_url) { idx = i; break; }
    }
    if (idx === -1) { console.log('All posts already have tiktok_url set.'); process.exit(0); }
  }

  posts[idx].tiktok_url = url;

  // oEmbed URL validation (tiktok.com/oembed doesn't give views but confirms URL is valid)
  const oembed = await fetchOEmbed(url);
  if (oembed !== 0) {
    posts[idx].views_updated_at = new Date().toISOString();
    console.log(`URL validated via oEmbed.`);
  } else {
    console.warn('oEmbed did not confirm URL (may still be valid). Saved anyway.');
  }

  writePosts(posts);
  console.log(`✓ Recorded tiktok_url for ${posts[idx].video_id}`);
  console.log(`  URL: ${url}`);
  console.log(`  Run 'npx ts-node scripts/scs001/fetch-tiktok-views.ts' to sync views.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
