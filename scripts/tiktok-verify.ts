/**
 * tiktok-verify.ts — Verify TikTok access token by fetching user.info.profile + user.info.stats
 *
 * Run AFTER tiktok-oauth.ts has written TIKTOK_ACCESS_TOKEN to .env.
 *
 * Usage:
 *   npx ts-node scripts/tiktok-verify.ts
 *
 * Env required:
 *   TIKTOK_ACCESS_TOKEN  — written by tiktok-oauth.ts
 *
 * Demonstrates the two approved scopes:
 *   user.info.profile  → display_name, avatar_url, bio_description, profile_deep_link, is_verified, username
 *   user.info.stats    → follower_count, following_count, likes_count, video_count
 *
 * This output is the demo of how Kognai uses TikTok data:
 *   - Profile identifies the authorized creator account
 *   - Stats feed into Kognai's content performance scoring pipeline
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';

if (!ACCESS_TOKEN) {
  console.error('[tiktok-verify] TIKTOK_ACCESS_TOKEN not found in .env');
  console.error('  Run: npx ts-node scripts/tiktok-oauth.ts  first');
  process.exit(1);
}

// All fields available under the two approved scopes
const PROFILE_FIELDS = [
  'open_id',
  'union_id',
  'display_name',
  'avatar_url',
  'bio_description',
  'profile_deep_link',
  'is_verified',
  'username',
].join(',');

const STATS_FIELDS = [
  'follower_count',
  'following_count',
  'likes_count',
  'video_count',
].join(',');

async function fetchUserInfo(fields: string): Promise<Record<string, unknown>> {
  const url = `https://open.tiktokapis.com/v2/user/info/?fields=${fields}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  });

  const json = await res.json() as any;

  if (json.error && json.error.code !== 'ok') {
    throw new Error(`TikTok API error: ${json.error.message} (code: ${json.error.code})`);
  }

  return json.data?.user || {};
}

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return 'N/A';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

async function main(): Promise<void> {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' TikTok API Verification — Kognai OAuth Demo');
  console.log('══════════════════════════════════════════════════\n');

  console.log('Fetching user.info.profile...');
  let profile: Record<string, unknown> = {};
  try {
    profile = await fetchUserInfo(PROFILE_FIELDS);
    console.log('  ✅ user.info.profile  — OK\n');
  } catch (err) {
    console.error(`  ❌ user.info.profile  — ${(err as Error).message}`);
  }

  console.log('Fetching user.info.stats...');
  let stats: Record<string, unknown> = {};
  try {
    stats = await fetchUserInfo(STATS_FIELDS);
    console.log('  ✅ user.info.stats    — OK\n');
  } catch (err) {
    console.error(`  ❌ user.info.stats    — ${(err as Error).message}`);
  }

  console.log('──────────────────────────────────────────────────');
  console.log(' CREATOR PROFILE  (user.info.profile)');
  console.log('──────────────────────────────────────────────────');
  console.log(`  Username       : @${profile.username ?? 'N/A'}`);
  console.log(`  Display name   : ${profile.display_name ?? 'N/A'}`);
  console.log(`  Verified       : ${profile.is_verified ? '✅ Yes' : 'No'}`);
  console.log(`  Bio            : ${profile.bio_description ?? '(empty)'}`);
  console.log(`  Profile link   : ${profile.profile_deep_link ?? 'N/A'}`);
  console.log(`  Open ID        : ${profile.open_id ?? 'N/A'}`);

  console.log('\n──────────────────────────────────────────────────');
  console.log(' ENGAGEMENT STATS  (user.info.stats)');
  console.log('──────────────────────────────────────────────────');
  console.log(`  Followers      : ${formatNumber(stats.follower_count as number)}`);
  console.log(`  Following      : ${formatNumber(stats.following_count as number)}`);
  console.log(`  Total likes    : ${formatNumber(stats.likes_count as number)}`);
  console.log(`  Videos posted  : ${formatNumber(stats.video_count as number)}`);

  console.log('\n──────────────────────────────────────────────────');
  console.log(' HOW KOGNAI USES THIS DATA');
  console.log('──────────────────────────────────────────────────');
  console.log('  1. Profile data identifies the authorized creator account');
  console.log('     and links it to the correct Kognai autonomous pipeline.');
  console.log('  2. Stats data (follower_count, video_count, likes_count)');
  console.log('     is ingested every 24h to compute a baseline engagement');
  console.log('     velocity score for the account.');
  console.log('  3. Each video Kognai generates is benchmarked against this');
  console.log('     baseline — clips scoring ≥1.2× baseline are promoted to');
  console.log('     the priority posting queue.');
  console.log('  4. No video is uploaded, modified, or deleted via this app.');
  console.log('     This access is read-only.\n');

  console.log('══════════════════════════════════════════════════');
  console.log(' Verification complete.');
  console.log('══════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error(`[tiktok-verify] Fatal: ${err.message}`);
  process.exit(1);
});
