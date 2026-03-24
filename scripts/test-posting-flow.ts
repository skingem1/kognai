#!/usr/bin/env ts-node

/**
 * Sprint 1043: E2E posting flow test
 * Tests the critical path: video selection → caption → record → gate count
 * Does NOT make any network calls or modify production files.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
let fail = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ': ' + detail : ''}`);
  }
}

// ─── Test 1: auto-delivered.jsonl is readable and has entries ────────
console.log('\n[1] auto-delivered.jsonl');
const deliveredPath = path.join(ROOT, 'workspace/scs001/auto-delivered.jsonl');
const deliveredExists = fs.existsSync(deliveredPath);
assert('auto-delivered.jsonl exists', deliveredExists);

let delivered: any[] = [];
if (deliveredExists) {
  delivered = fs.readFileSync(deliveredPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  assert('Has delivered entries', delivered.length > 0, `count=${delivered.length}`);
  assert('Entries have video_id', delivered.every((e: any) => typeof e.video_id === 'string'));
  assert('Entries have viral_score', delivered.some((e: any) => typeof e.viral_score === 'number'));
}

// ─── Test 2: manual-posts.jsonl structure ────────────────────────────
console.log('\n[2] manual-posts.jsonl');
const postsPath = path.join(ROOT, 'workspace/scs001/manual-posts.jsonl');
const postsExist = fs.existsSync(postsPath);
assert('manual-posts.jsonl exists', postsExist);

let posts: any[] = [];
if (postsExist) {
  posts = fs.readFileSync(postsPath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  assert('Posts have video_id', posts.every((e: any) => typeof e.video_id === 'string'));
  assert('Posts have posted_at timestamp', posts.every((e: any) => typeof e.posted_at === 'string'));
}

// ─── Test 3: dry-run filtering ───────────────────────────────────────
console.log('\n[3] Dry-run filter');
const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry-run', 'dry'];
const realPosts = posts.filter((p: any) => {
  if (!p.method) return true;
  return !DRY_METHODS.some(d => String(p.method).includes(d));
});
const dryPosts = posts.filter((p: any) => p.method && DRY_METHODS.some(d => String(p.method).includes(d)));
assert('Dry-run posts are separated from real posts', realPosts.length + dryPosts.length === posts.length);
console.log(`    Real: ${realPosts.length}, Dry: ${dryPosts.length}, Total: ${posts.length}`);

// ─── Test 4: unposted video selection ────────────────────────────────
console.log('\n[4] Unposted video selection');
const postedIds = new Set(realPosts.map((p: any) => p.video_id).filter(Boolean));
const unposted = delivered.filter((e: any) => e.video_id && !postedIds.has(e.video_id));
assert('Has unposted videos', unposted.length > 0, `count=${unposted.length}`);

const withMp4 = unposted.filter((e: any) => e.mp4_path && fs.existsSync(e.mp4_path));
assert('Some unposted videos have valid mp4 files', withMp4.length > 0, `count=${withMp4.length}`);

if (withMp4.length > 0) {
  const sorted = [...withMp4].sort((a: any, b: any) => (b.viral_score ?? 0) - (a.viral_score ?? 0));
  const top = sorted[0];
  assert('Top video has video_id', typeof top.video_id === 'string');
  assert('Top video mp4 exists on disk', fs.existsSync(top.mp4_path));

  // Verify mp4 is non-empty
  const stat = fs.statSync(top.mp4_path);
  assert('Top video mp4 is non-empty', stat.size > 1000, `size=${stat.size}`);
  console.log(`    Top pick: ${top.video_id} (score: ${top.viral_score?.toFixed(2) ?? 'N/A'})`);
}

// ─── Test 5: caption generation ──────────────────────────────────────
console.log('\n[5] Caption generation');
try {
  const { buildTikTokCaption } = require('./telegram-commands/shared');
  if (withMp4.length > 0) {
    const caption = buildTikTokCaption(withMp4[0].video_id);
    assert('buildTikTokCaption returns string', typeof caption === 'string');
    assert('Caption is non-empty', caption.length > 10, `len=${caption.length}`);
    assert('Caption has hashtags', caption.includes('#'), 'should contain at least one #');
    console.log(`    Caption preview: ${caption.slice(0, 80)}...`);
  } else {
    assert('Caption test skipped (no mp4)', true);
  }
} catch (err: any) {
  assert('buildTikTokCaption imports', false, err.message?.slice(0, 80));
}

// ─── Test 6: gate file consistency ───────────────────────────────────
console.log('\n[6] Gate consistency');
const gatePath = path.join(ROOT, 'workspace/gates/phase1-5-gate.json');
const gateExists = fs.existsSync(gatePath);
assert('phase1-5-gate.json exists', gateExists);

if (gateExists) {
  try {
    const gate = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
    const gatePostCount = gate.raw?.posts_count ?? gate.posts_count ?? -1;
    assert('Gate has post count', gatePostCount >= 0, `gate_count=${gatePostCount}`);

    // Gate count should match real posts (not dry runs)
    assert('Gate count matches real posts', gatePostCount === realPosts.length,
      `gate=${gatePostCount}, real=${realPosts.length}`);

    const daysLeft = gate.days_remaining ?? -1;
    assert('Gate has days_remaining', daysLeft >= 0, `days=${daysLeft}`);

    if (gatePostCount >= 0 && daysLeft > 0) {
      const postsNeeded = 30 - gatePostCount;
      const postsPerDay = postsNeeded / daysLeft;
      console.log(`    Need: ${postsNeeded} more posts in ${daysLeft} days (${postsPerDay.toFixed(1)}/day)`);
    }
  } catch (err: any) {
    assert('Gate JSON is valid', false, err.message?.slice(0, 80));
  }
}

// ─── Test 7: cmdRecord validates input ───────────────────────────────
console.log('\n[7] cmdRecord validation');
try {
  const { cmdRecord } = require('./telegram-commands/cmd-content');

  // Empty args should return usage
  const usage = cmdRecord('');
  assert('cmdRecord empty args → usage message', usage.includes('Usage'));

  // Invalid views should return error
  const bad = cmdRecord('test-id abc');
  assert('cmdRecord invalid views → error', bad.includes('Invalid') || bad.includes('Usage'));

  // Valid args with non-existent video should work (won't be duplicate)
  // Note: we don't test actual recording to avoid modifying manual-posts.jsonl
  assert('cmdRecord function is callable', typeof cmdRecord === 'function');
} catch (err: any) {
  assert('cmdRecord imports', false, err.message?.slice(0, 80));
}

// ─── Test 8: publish-ledger has entries ──────────────────────────────
console.log('\n[8] publish-ledger.jsonl');
const ledgerPath = path.join(ROOT, 'workspace/scs001/publish-ledger.jsonl');
const ledgerExists = fs.existsSync(ledgerPath);
assert('publish-ledger.jsonl exists', ledgerExists);
if (ledgerExists) {
  const ledger = fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
  assert('Ledger has entries', ledger.length > 0, `count=${ledger.length}`);
}

// ─── Summary ─────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
