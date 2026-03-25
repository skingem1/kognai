// monitor-manual-posting.ts — TikTok view count refresh for gate metrics
// Sprint 1308: reads manual-posts.jsonl, calls TikTok API for view counts,
// updates views in-place, writes posting-health.json summary.
// If TIKTOK_ACCESS_TOKEN not set or no tiktok_post_id entries: dry-run mode.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const MANUAL_POSTS_FILE = join('workspace', 'scs001', 'manual-posts.jsonl');
const POSTING_HEALTH_FILE = join('reports', 'posting-health.json');
const TIKTOK_API = 'https://open.tiktokapis.com/v2/video/query/';

interface ManualPost {
  video_id?: string;
  tiktok_post_id?: string;
  views?: number;
  posted_at?: string;
  source?: string;
  method?: string;
  [key: string]: unknown;
}

interface PostingHealth {
  timestamp: string;
  posts_checked: number;
  posts_with_tiktok_id: number;
  views_updated: number;
  total_views: number;
  avg_views: number;
  dry_run: boolean;
}

function readPosts(): ManualPost[] {
  if (!existsSync(MANUAL_POSTS_FILE)) return [];
  return readFileSync(MANUAL_POSTS_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ManualPost);
}

function writePosts(posts: ManualPost[]): void {
  writeFileSync(MANUAL_POSTS_FILE, posts.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
}

function fetchViewCount(postId: string, token: string): Promise<number | null> {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      filters: { video_ids: [postId] },
      fields: ['view_count'],
    });
    const url = new URL(TIKTOK_API);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const videos = parsed?.data?.videos ?? [];
            const entry = videos.find((v: { id: string }) => v.id === postId);
            resolve(entry?.view_count ?? null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const dryRun = !token;

  if (dryRun) {
    console.log('[monitor-manual-posting] TIKTOK_ACCESS_TOKEN not set — dry-run mode');
  }

  const posts = readPosts();
  const postsWithId = posts.filter((p) => p.tiktok_post_id);
  console.log(`[monitor-manual-posting] ${posts.length} posts total, ${postsWithId.length} with tiktok_post_id`);

  let viewsUpdated = 0;

  if (!dryRun && postsWithId.length > 0) {
    for (const post of posts) {
      if (!post.tiktok_post_id) continue;
      const views = await fetchViewCount(post.tiktok_post_id, token!);
      if (views !== null) {
        post.views = views;
        viewsUpdated++;
        console.log(`  [+] ${post.tiktok_post_id} → ${views} views`);
      } else {
        console.log(`  [-] ${post.tiktok_post_id} → could not fetch views`);
      }
    }
    writePosts(posts);
    console.log(`[monitor-manual-posting] Updated ${viewsUpdated} entries in ${MANUAL_POSTS_FILE}`);
  }

  const totalViews = posts.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const health: PostingHealth = {
    timestamp: new Date().toISOString(),
    posts_checked: posts.length,
    posts_with_tiktok_id: postsWithId.length,
    views_updated: viewsUpdated,
    total_views: totalViews,
    avg_views: posts.length > 0 ? Math.round(totalViews / posts.length) : 0,
    dry_run: dryRun,
  };

  writeFileSync(POSTING_HEALTH_FILE, JSON.stringify(health, null, 2), 'utf8');
  console.log('[monitor-manual-posting] posting-health.json written:', health);
}

main().catch((err) => {
  console.error('[monitor-manual-posting] Fatal:', err.message);
  process.exit(1);
});
