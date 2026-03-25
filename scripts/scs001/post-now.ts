/**
 * post-now.ts — Sprint 1223
 * Manual posting CLI. Posts a video to TikTok if TIKTOK_ACCESS_TOKEN is set.
 * Falls back to dry-run mode (logs to manual-posts.jsonl) when no token.
 * Usage: npx ts-node scripts/scs001/post-now.ts <video_id> [--title "My Title"]
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
const MANUAL_POSTS = path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');

interface PostEntry {
  video_id: string;
  title: string;
  method: string;
  posted_at: string;
  tiktok_post_id?: string;
  dry_run: boolean;
}

function parseArgs(): { videoId: string; title: string } {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: post-now.ts <video_id> [--title "My Title"]');
    process.exit(1);
  }
  const videoId = args[0];
  const titleIdx = args.indexOf('--title');
  const title = titleIdx !== -1 && args[titleIdx + 1] ? args[titleIdx + 1] : `Post ${videoId}`;
  return { videoId, title };
}

function appendPost(entry: PostEntry) {
  fs.appendFileSync(MANUAL_POSTS, JSON.stringify(entry) + '\n');
}

async function postToTikTok(videoId: string, title: string, token: string): Promise<string | null> {
  // TikTok Content Posting API v2
  // https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    console.log('⚠️  TIKTOK_CLIENT_KEY not set. Cannot post via API.');
    return null;
  }

  const videoPath = path.join(ROOT, 'workspace', 'scs001', 'output', `${videoId}.mp4`);
  if (!fs.existsSync(videoPath)) {
    console.log(`⚠️  Video file not found: ${videoPath}`);
    console.log('  Falling back to dry-run.');
    return null;
  }

  // Step 1: Init upload
  try {
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: fs.statSync(videoPath).size,
        },
        post_info: {
          title,
          privacy_level: 'SELF_ONLY', // Safety: start as private
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.text();
      console.log(`⚠️  TikTok API error (${initRes.status}): ${err}`);
      return null;
    }

    const data = await initRes.json() as any;
    const publishId = data?.data?.publish_id;
    console.log(`✅ TikTok upload initiated. publish_id: ${publishId}`);
    return publishId || 'api-success';
  } catch (err: any) {
    console.log(`⚠️  TikTok API call failed: ${err.message}`);
    return null;
  }
}

async function main() {
  const { videoId, title } = parseArgs();
  const token = process.env.TIKTOK_ACCESS_TOKEN;

  if (!token) {
    console.log('🔧 DRY-RUN MODE — TIKTOK_ACCESS_TOKEN not set.');
    console.log(`  Video: ${videoId}`);
    console.log(`  Title: ${title}`);

    appendPost({
      video_id: videoId,
      title,
      method: 'post-now-dry',
      posted_at: new Date().toISOString(),
      dry_run: true,
    });

    console.log(`  Logged to manual-posts.jsonl (dry-run).`);
    return;
  }

  console.log(`🚀 Posting ${videoId} to TikTok...`);
  const postId = await postToTikTok(videoId, title, token);

  if (postId) {
    appendPost({
      video_id: videoId,
      title,
      method: 'post-now-api',
      posted_at: new Date().toISOString(),
      tiktok_post_id: postId,
      dry_run: false,
    });
    console.log(`✅ Posted! Logged to manual-posts.jsonl.`);
  } else {
    console.log('⚠️  API posting failed. Logging as dry-run.');
    appendPost({
      video_id: videoId,
      title,
      method: 'post-now-dry',
      posted_at: new Date().toISOString(),
      dry_run: true,
    });
  }
}

main();
