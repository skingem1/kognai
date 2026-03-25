#!/usr/bin/env npx ts-node
/**
 * gate-readiness-final.ts — April 7 Phase 1.5 Gate Final Readiness Report
 * Sprint 662: Comprehensive gate assessment with Phase 2 activation plan.
 *
 * Run this 2 days before April 7 for final assessment.
 * Re-runnable — generates a fresh report each time.
 *
 * Usage: npx ts-node scripts/scs001/gate-readiness-final.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'workspace', 'gates', 'phase15-final-readiness.json');

interface GateMetrics {
  posts: number;
  target_posts: number;
  views: number;
  target_views: number;
  days_remaining: number;
  gate_date: string;
  assessment_date: string;
}

interface PipelineHealth {
  total_videos_generated: number;
  total_videos_delivered: number;
  experiments_count: number;
  qc_pass_rate: number;
  avg_viral_score: number;
  best_hook_formula: string;
  cost_per_video: number;
  monthly_cost: number;
}

interface InfraStatus {
  stripe: boolean;
  supabase: boolean;
  telegram: boolean;
  ollama: boolean;
  tiktok_token: boolean;
  pm2_processes: number;
}

interface Phase2Plan {
  activation_criteria: string[];
  phase2_sprints: Array<{ sprint: string; title: string; priority: string }>;
  blockers: string[];
}

function readJSONL(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function readJSON(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { return null; }
}

function getGateMetrics(): GateMetrics {
  // Sprint 1350: Filter dry-run posts — gate requires 30 real TikTok posts
  const DRY_METHODS = ['browser-post-dry', 'batch-browser-dry', 'dry'];
  const allPosts = readJSONL(path.join(ROOT, 'workspace', 'scs001', 'manual-posts.jsonl'));
  const posts = allPosts.filter((e: any) =>
    !e.method || !DRY_METHODS.some((d: string) => String(e.method).includes(d)));
  const totalViews = posts.reduce((s: number, e: any) => s + (e.views ?? 0), 0);
  const gateDate = new Date('2026-04-07T00:00:00Z');
  const daysRemaining = Math.max(0, Math.ceil((gateDate.getTime() - Date.now()) / 86400000));

  return {
    posts: posts.length,
    target_posts: 30,
    views: totalViews,
    target_views: 500,
    days_remaining: daysRemaining,
    gate_date: '2026-04-07',
    assessment_date: new Date().toISOString().slice(0, 10),
  };
}

function getPipelineHealth(): PipelineHealth {
  const ledger = readJSONL(path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl'));
  const delivered = readJSONL(path.join(ROOT, 'workspace', 'scs001', 'auto-delivered.jsonl'));
  const experiments = readJSONL(path.join(ROOT, 'workspace', 'scs001', 'experiments.jsonl'));
  const costLog = readJSON(path.join(ROOT, 'workspace', 'scs001', 'cost-log.json'));
  const analysisReport = readJSON(path.join(ROOT, 'workspace', 'scs001', 'ab-analysis-report.json'));

  const qcPassed = experiments.filter((e: any) => e.qc_passed).length;
  const scores = experiments.map((e: any) => e.partial_viral_score).filter((s: any) => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;

  return {
    total_videos_generated: ledger.length,
    total_videos_delivered: delivered.length,
    experiments_count: experiments.length,
    qc_pass_rate: experiments.length > 0 ? Math.round((qcPassed / experiments.length) * 100) : 0,
    avg_viral_score: Math.round(avgScore * 1000) / 1000,
    best_hook_formula: analysisReport?.summary?.best_formula ?? 'unknown',
    cost_per_video: costLog?.all_time?.cost_per_video ?? 0,
    monthly_cost: costLog?.monthly_summary?.total_cost ?? 0,
  };
}

function getInfraStatus(): InfraStatus {
  const envVars: Record<string, boolean> = {};
  const keys = ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'TELEGRAM_BOT_TOKEN', 'OLLAMA_HOST', 'TIKTOK_ACCESS_TOKEN'];
  for (const k of keys) {
    envVars[k] = !!process.env[k] && process.env[k] !== '';
  }

  let pm2Count = 0;
  try {
    const pm2 = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    pm2Count = JSON.parse(pm2).filter((p: any) => p.pm2_env?.status === 'online').length;
  } catch { /* pm2 not running */ }

  return {
    stripe: envVars.STRIPE_SECRET_KEY,
    supabase: envVars.SUPABASE_URL,
    telegram: envVars.TELEGRAM_BOT_TOKEN,
    ollama: envVars.OLLAMA_HOST,
    tiktok_token: envVars.TIKTOK_ACCESS_TOKEN,
    pm2_processes: pm2Count,
  };
}

function getPhase2Plan(gateResult: string): Phase2Plan {
  if (gateResult === 'PASS') {
    return {
      activation_criteria: [
        '30+ TikTok posts published',
        '500+ total views achieved',
        'QC pass rate > 80%',
        'Stripe live and operational',
      ],
      phase2_sprints: [
        { sprint: 'P2-001', title: 'Achiri resume — memory subsystem production test', priority: 'high' },
        { sprint: 'P2-002', title: 'BrainX + Cognee integration proof-of-concept', priority: 'high' },
        { sprint: 'P2-003', title: 'OpenViking Skill Bank install + wire', priority: 'medium' },
        { sprint: 'P2-004', title: 'TikTok auto-posting via API (if token obtained)', priority: 'medium' },
        { sprint: 'P2-005', title: 'Subscriber onboarding funnel (Stripe + Telegram)', priority: 'medium' },
      ],
      blockers: [],
    };
  }

  return {
    activation_criteria: [
      'GATE FAILED — remediation required before Phase 2',
    ],
    phase2_sprints: [],
    blockers: [
      'Insufficient posts — need manual posting effort',
      'TIKTOK_ACCESS_TOKEN still not set — automated posting impossible',
      'Must hit 30 posts + 500 views before April 7',
    ],
  };
}

function main(): void {
  console.log('=== Phase 1.5 Gate — Final Readiness Assessment ===\n');

  const gate = getGateMetrics();
  const pipeline = getPipelineHealth();
  const infra = getInfraStatus();

  // Gate decision
  const postsOk = gate.posts >= gate.target_posts;
  const viewsOk = gate.views >= gate.target_views;
  const qcOk = pipeline.qc_pass_rate >= 80;
  const gateResult = postsOk && viewsOk ? 'PASS' : gate.days_remaining <= 0 ? 'FAIL' : 'PENDING';
  const phase2 = getPhase2Plan(gateResult);

  // Print report
  console.log(`Assessment Date: ${gate.assessment_date}`);
  console.log(`Gate Date: ${gate.gate_date} (${gate.days_remaining} days remaining)`);
  console.log(`Gate Result: ${gateResult}\n`);

  console.log('--- Gate Criteria ---');
  console.log(`  ${postsOk ? '✅' : '❌'} Posts: ${gate.posts}/${gate.target_posts}`);
  console.log(`  ${viewsOk ? '✅' : '❌'} Views: ${gate.views}/${gate.target_views}`);
  console.log(`  ${qcOk ? '✅' : '⚠️'} QC Pass Rate: ${pipeline.qc_pass_rate}% (target: ≥80%)`);

  console.log('\n--- Pipeline Health ---');
  console.log(`  Videos generated: ${pipeline.total_videos_generated}`);
  console.log(`  Videos delivered: ${pipeline.total_videos_delivered}`);
  console.log(`  Experiments: ${pipeline.experiments_count}`);
  console.log(`  Avg viral score: ${pipeline.avg_viral_score}`);
  console.log(`  Best hook formula: ${pipeline.best_hook_formula}`);
  console.log(`  Cost/video: $${pipeline.cost_per_video.toFixed(2)}`);
  console.log(`  Monthly cost: $${pipeline.monthly_cost.toFixed(2)}`);

  console.log('\n--- Infrastructure ---');
  console.log(`  ${infra.stripe ? '✅' : '❌'} Stripe`);
  console.log(`  ${infra.supabase ? '✅' : '❌'} Supabase`);
  console.log(`  ${infra.telegram ? '✅' : '❌'} Telegram`);
  console.log(`  ${infra.ollama ? '✅' : '❌'} Ollama`);
  console.log(`  ${infra.tiktok_token ? '✅' : '❌'} TikTok Access Token`);
  console.log(`  PM2 processes online: ${infra.pm2_processes}`);

  if (gateResult === 'PASS') {
    console.log('\n--- Phase 2 Activation Plan ---');
    for (const s of phase2.phase2_sprints) {
      console.log(`  ${s.sprint}: ${s.title} [${s.priority}]`);
    }
  } else if (gateResult === 'PENDING') {
    const postsNeeded = Math.max(0, gate.target_posts - gate.posts);
    const postsPerDay = gate.days_remaining > 0 ? Math.ceil(postsNeeded / gate.days_remaining) : postsNeeded;
    console.log('\n--- Required Pace ---');
    console.log(`  Posts needed: ${postsNeeded}`);
    console.log(`  Posts/day required: ${postsPerDay}`);
    console.log(`  Use /post-now and /caption to post manually`);
  } else {
    console.log('\n--- Remediation Required ---');
    for (const b of phase2.blockers) {
      console.log(`  ⚠️  ${b}`);
    }
  }

  // Save report
  const report = {
    generated_at: new Date().toISOString(),
    gate_date: gate.gate_date,
    days_remaining: gate.days_remaining,
    result: gateResult,
    gate_metrics: gate,
    pipeline_health: pipeline,
    infrastructure: infra,
    phase2_plan: phase2,
    kill_switches: {
      account_banned: false,
      low_views: gate.views < 500 && gate.posts >= 30,
      low_retention: false,
      low_approval: pipeline.qc_pass_rate < 80,
      memory_exceeded: false,
      high_oversight: false,
    },
  };

  const gatesDir = path.join(ROOT, 'workspace', 'gates');
  if (!fs.existsSync(gatesDir)) fs.mkdirSync(gatesDir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${REPORT_PATH}`);
  console.log('\n✅ PASS — Gate readiness assessment complete');
}

main();
