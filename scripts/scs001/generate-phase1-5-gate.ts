// generate-phase1-5-gate.ts — Sprint 132
// Phase 1.5 gate review: reads manual post data, computes gate criteria,
// writes workspace/gates/phase1-5-gate.json with PROCEED/KILL recommendation.
//
// Kill switch: <500 views across 30 posts → shut down TikTok, focus Achiri-only.
//
// Usage: npx ts-node scripts/scs001/generate-phase1-5-gate.ts
// Exit 0 = PASS (PROCEED), Exit 1 = FAIL (KILL)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT             = resolve(__dirname, '..', '..');
const MANUAL_POSTS_PATH = join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl');
const GATES_DIR        = join(ROOT, 'workspace', 'gates');
const OUTPUT_PATH      = join(GATES_DIR, 'phase1-5-gate.json');

const POSTS_TARGET = 30;
const VIEWS_TARGET = 500;

interface ManualPost {
  video_id:  string;
  views:     number;
  title?:    string;
  posted_at: string;
}

function loadPosts(): ManualPost[] {
  if (!existsSync(MANUAL_POSTS_PATH)) return [];
  const lines = readFileSync(MANUAL_POSTS_PATH, 'utf-8').split('\n');
  const posts: ManualPost[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try { posts.push(JSON.parse(t)); } catch { /* skip corrupt */ }
  }
  return posts;
}

function main(): void {
  const posts       = loadPosts();
  const postsCount  = posts.length;
  const totalViews  = posts.reduce((s, p) => s + (p.views ?? 0), 0);
  const avgViews    = postsCount > 0 ? Math.round(totalViews / postsCount) : 0;
  const passesPostCount = postsCount >= POSTS_TARGET;
  const passesViews     = totalViews >= VIEWS_TARGET;
  const overallPass     = passesPostCount && passesViews;

  const recommendation = overallPass
    ? 'PROCEED to Phase 2A — TikTok stable. Launch Achiri alpha Apr 25.'
    : `KILL SWITCH — ${!passesPostCount ? `only ${postsCount}/${POSTS_TARGET} posts` : `only ${totalViews}/${VIEWS_TARGET} views`}. Shut down TikTok agent, focus on Achiri-only roadmap.`;

  const gateReport = {
    gate:    'phase1-5-tiktok-kill-switch',
    date:    new Date().toISOString().slice(0, 10),
    generated_at: new Date().toISOString(),
    criteria: [
      {
        id:      'post-count',
        name:    `Manual TikTok Posts (target: ${POSTS_TARGET})`,
        pass:    passesPostCount,
        details: `${postsCount} posts recorded in manual-posts.jsonl`,
      },
      {
        id:      'total-views',
        name:    `Total Views Across Posts (target: ${VIEWS_TARGET})`,
        pass:    passesViews,
        details: `${totalViews} total views | avg ${avgViews} views/post`,
      },
    ],
    overall_pass:    overallPass,
    recommendation,
    raw: {
      posts_count: postsCount,
      total_views: totalViews,
      avg_views:   avgViews,
    },
  };

  mkdirSync(GATES_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(gateReport, null, 2), 'utf-8');

  const icon = overallPass ? '✅ PASS' : '❌ FAIL';
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  PHASE 1.5 GATE REVIEW — TikTok Kill Switch (Apr 7)');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Posts:       ${postsCount} / ${POSTS_TARGET}  ${passesPostCount ? '✅' : '❌'}`);
  console.log(`  Total views: ${totalViews} / ${VIEWS_TARGET}  ${passesViews ? '✅' : '❌'}`);
  console.log(`  Avg views:   ${avgViews} / post`);
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Overall: ${icon}`);
  console.log(`  ${recommendation}`);
  console.log('──────────────────────────────────────────────────────');
  console.log(`  Report: ${OUTPUT_PATH}`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(overallPass ? 0 : 1);
}

main();
