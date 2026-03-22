#!/usr/bin/env npx ts-node
/**
 * generate-april7-gate.ts — Sprint 794 (GATE)
 *
 * Comprehensive April 7 Phase 1.5 gate readiness report.
 * Checks: warmup, Browser Use CLI, posting progress, pipeline health,
 * Stripe, days remaining. Outputs JSON to workspace/gates/april-7-gate.json.
 *
 * Usage: npx ts-node scripts/scs001/generate-april7-gate.ts
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '../..');
const OUTPUT = join(ROOT, 'workspace', 'gates', 'april-7-gate.json');
const GATE_DATE = new Date('2026-04-07T00:00:00Z');

function readJSONL(filePath: string): any[] {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function generate() {
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((GATE_DATE.getTime() - now.getTime()) / 86_400_000));
  const isGateDay = daysLeft === 0;

  // --- Posts & Views ---
  const manualPosts = readJSONL(join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const postCount = manualPosts.length;
  const totalViews = manualPosts.reduce((s, p) => s + (p.views ?? 0), 0);
  const postsNeeded = Math.max(0, 30 - postCount);
  const viewsNeeded = Math.max(0, 500 - totalViews);
  const paceNeeded = daysLeft > 0 ? +(postsNeeded / daysLeft).toFixed(1) : postsNeeded > 0 ? Infinity : 0;

  // --- Pipeline / Publishable ---
  const ledger = readJSONL(join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const autoDelivered = readJSONL(join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
  const postedIds = new Set([
    ...manualPosts.map((p: any) => p.video_id).filter(Boolean),
    ...autoDelivered.map((p: any) => p.video_id).filter(Boolean),
  ]);
  const readyToPost = ledger.filter((e: any) => e.video_id && !postedIds.has(e.video_id)).length;

  // --- Warmup ---
  const warmupPath = join(ROOT, 'workspace', 'scs001', 'warmup-status.json');
  let warmup: any = { status: 'not_started', verified: false };
  if (existsSync(warmupPath)) {
    try {
      const ws = JSON.parse(readFileSync(warmupPath, 'utf-8'));
      warmup = {
        status: ws.verified ? 'verified' : ws.warmup_complete ? 'complete_unverified' : 'in_progress',
        verified: !!ws.verified,
        days_active: ws.days_active ?? 0,
        niche_alignment: ws.niche_alignment ?? null,
        started_at: ws.warmup_started_at ?? null,
        completed_at: ws.warmup_completed_at ?? null,
      };
    } catch {}
  }

  // --- Browser Use CLI ---
  let browserUseInstalled = false;
  try {
    execSync('pip3 show browser-use 2>/dev/null', { timeout: 5000 });
    browserUseInstalled = true;
  } catch {}
  const postScriptExists = existsSync(join(ROOT, 'scripts', 'scs001', 'post-tiktok.sh'));

  // --- Stripe ---
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_GROWTH', 'STRIPE_PRICE_PREMIUM'];
  const stripeSet = stripeKeys.filter(k => !!process.env[k]).length;

  // --- V2 Pipeline ---
  const v2PipelineExists = existsSync(join(ROOT, 'scripts', 'scs001', 'run-v2-pipeline.ts'));

  // --- Experiments ---
  const experiments = readJSONL(join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const avgViralScore = experiments.length > 0
    ? experiments.reduce((s, e) => s + (e.partial_viral_score ?? 0), 0) / experiments.length
    : 0;

  // --- Criteria ---
  const criteria = [
    {
      id: 'post-count',
      name: '30 TikTok Posts',
      target: 30,
      actual: postCount,
      pass: postCount >= 30,
      gap: postsNeeded,
      pace_needed: paceNeeded,
    },
    {
      id: 'total-views',
      name: '500 Total Views',
      target: 500,
      actual: totalViews,
      pass: totalViews >= 500,
      gap: viewsNeeded,
      avg_per_post: postCount > 0 ? Math.round(totalViews / postCount) : 0,
    },
    {
      id: 'pipeline-operational',
      name: 'Pipeline Producing Videos',
      target: '10+ in ledger',
      actual: ledger.length,
      pass: ledger.length >= 10,
    },
    {
      id: 'monetization-ready',
      name: 'Stripe Configured',
      target: `${stripeKeys.length}/${stripeKeys.length} keys`,
      actual: `${stripeSet}/${stripeKeys.length}`,
      pass: stripeSet === stripeKeys.length,
    },
  ];

  const passed = criteria.filter(c => c.pass).length;
  const overallStatus = passed === criteria.length ? 'PASS' : 'FAIL';

  // --- Blockers ---
  const blockers: string[] = [];
  if (postCount === 0) blockers.push('CRITICAL: 0 posts — start posting immediately');
  if (warmup.status === 'not_started') blockers.push('Warmup not started — TikTok may throttle fresh account');
  if (!browserUseInstalled) blockers.push('browser-use CLI not installed — automated posting unavailable');
  if (postsNeeded > 0 && daysLeft <= 7) blockers.push(`Only ${daysLeft} days left with ${postsNeeded} posts needed — ${paceNeeded}/day required`);

  // --- Action items ---
  const actions: string[] = [];
  if (warmup.status === 'not_started') actions.push('Complete 3 days of TikTok scrolling/following (manual warmup)');
  if (!browserUseInstalled) actions.push('Install browser-use: pip3 install browser-use');
  if (postCount === 0) actions.push('Post first video via /deliver + manual TikTok upload');
  if (readyToPost > 0) actions.push(`Post from queue: ${readyToPost} videos ready (/deliver)`);
  if (stripeSet < stripeKeys.length) actions.push('Complete Stripe key configuration');

  const report = {
    report_id: 'april-7-gate-v2',
    gate_name: 'Phase 1.5 Decision Gate',
    gate_date: '2026-04-07',
    generated_at: now.toISOString(),
    is_gate_day: isGateDay,
    days_until_gate: daysLeft,
    overall_status: overallStatus,
    criteria_passed: `${passed}/${criteria.length}`,
    criteria,
    warmup,
    browser_use: {
      cli_installed: browserUseInstalled,
      post_script_exists: postScriptExists,
      posting_ready: browserUseInstalled && postScriptExists,
    },
    pipeline: {
      total_videos_generated: ledger.length,
      ready_to_post: readyToPost,
      already_posted: postedIds.size,
      avg_viral_score: +avgViralScore.toFixed(3),
      v2_pipeline_exists: v2PipelineExists,
    },
    stripe: {
      keys_configured: `${stripeSet}/${stripeKeys.length}`,
      ready: stripeSet === stripeKeys.length,
    },
    blockers,
    actions,
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  // Print summary
  console.log(`\n=== April 7 Gate Readiness Report ===`);
  console.log(`Status: ${overallStatus} (${passed}/${criteria.length} criteria met)`);
  console.log(`Days remaining: ${daysLeft}`);
  console.log(`Posts: ${postCount}/30 | Views: ${totalViews}/500`);
  console.log(`Pipeline: ${ledger.length} total, ${readyToPost} ready to post`);
  console.log(`Warmup: ${warmup.status}`);
  console.log(`Browser Use: ${browserUseInstalled ? 'installed' : 'NOT installed'} | Post script: ${postScriptExists ? 'exists' : 'missing'}`);
  console.log(`Stripe: ${stripeSet}/${stripeKeys.length} keys`);
  if (blockers.length > 0) {
    console.log(`\nBlockers:`);
    blockers.forEach(b => console.log(`  ⛔ ${b}`));
  }
  if (actions.length > 0) {
    console.log(`\nAction Items:`);
    actions.forEach(a => console.log(`  → ${a}`));
  }
  console.log(`\nReport saved: ${OUTPUT}`);
}

generate();
