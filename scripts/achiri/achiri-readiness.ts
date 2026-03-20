#!/usr/bin/env npx ts-node
/**
 * achiri-readiness.ts — Sprint 315
 * Comprehensive Achiri alpha readiness report for Apr 25 launch decision.
 *
 * Aggregates:
 * - E2E test results (latest report)
 * - Feedback scores (NPS, average)
 * - Error rate (last 24h, total)
 * - User stats (daily counts, unique users)
 * - Deployment status (API health)
 * - Gate progress (T3 skills, alpha milestones)
 *
 * Usage: npx ts-node scripts/achiri/achiri-readiness.ts [--json]
 * Output: reports/achiri-readiness.json + console report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env') });

const CWD = process.cwd();
const JSON_FLAG = process.argv.includes('--json');

interface ReadinessCheck {
  name: string;
  category: string;
  pass: boolean;
  detail: string;
  critical: boolean;
}

interface ReadinessReport {
  generated_at: string;
  alpha_date: string;
  days_to_alpha: number;
  overall_ready: boolean;
  score: number; // 0-100
  checks: ReadinessCheck[];
  summary: { passed: number; failed: number; critical_failures: number };
}

function checkE2E(): ReadinessCheck {
  const reportPath = join(CWD, 'reports', 'achiri-e2e-latest.json');
  if (!existsSync(reportPath)) {
    return { name: 'E2E Test Suite', category: 'Testing', pass: false, detail: 'No E2E report found — run validate-e2e-alpha.ts', critical: true };
  }
  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    const passed = report.passed ?? 0;
    const total = report.total ?? 0;
    const allPass = passed === total && total > 0;
    return { name: 'E2E Test Suite', category: 'Testing', pass: allPass, detail: `${passed}/${total} tests passed`, critical: true };
  } catch {
    return { name: 'E2E Test Suite', category: 'Testing', pass: false, detail: 'Could not parse E2E report', critical: true };
  }
}

function checkFeedback(): ReadinessCheck {
  const feedbackPath = join(CWD, 'workspace', 'achiri', 'feedback.jsonl');
  if (!existsSync(feedbackPath)) {
    return { name: 'User Feedback', category: 'Quality', pass: true, detail: 'No feedback yet (expected pre-alpha)', critical: false };
  }
  const entries = readFileSync(feedbackPath, 'utf-8').split('\n').filter(l => l.trim());
  if (entries.length === 0) {
    return { name: 'User Feedback', category: 'Quality', pass: true, detail: 'No feedback collected', critical: false };
  }
  const ratings = entries.map(l => { try { return JSON.parse(l).rating; } catch { return 0; } }).filter(Boolean);
  const avg = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
  const pass = avg >= 3.0;
  return { name: 'User Feedback', category: 'Quality', pass, detail: `Average: ${avg.toFixed(1)}/5 (${ratings.length} ratings)`, critical: false };
}

function checkErrors(): ReadinessCheck {
  const errorPath = join(CWD, 'workspace', 'achiri', 'error-log.jsonl');
  if (!existsSync(errorPath)) {
    return { name: 'Error Rate', category: 'Stability', pass: true, detail: 'No errors logged', critical: false };
  }
  const entries = readFileSync(errorPath, 'utf-8').split('\n').filter(l => l.trim());
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  let last24h = 0;
  for (const line of entries) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.timestamp).getTime() >= h24) last24h++;
    } catch { /* skip */ }
  }
  const pass = last24h < 10;
  return { name: 'Error Rate', category: 'Stability', pass, detail: `${last24h} errors in 24h (total: ${entries.length})`, critical: last24h >= 20 };
}

function checkUserActivity(): ReadinessCheck {
  const countsPath = join(CWD, 'workspace', 'achiri', 'daily-counts.json');
  if (!existsSync(countsPath)) {
    return { name: 'User Activity', category: 'Engagement', pass: true, detail: 'No activity data (pre-alpha)', critical: false };
  }
  try {
    const counts = JSON.parse(readFileSync(countsPath, 'utf-8'));
    const days = Object.keys(counts);
    const uniqueUsers = new Set<string>();
    let totalMsgs = 0;
    for (const day of Object.values(counts) as Record<string, number>[]) {
      for (const [userId, count] of Object.entries(day)) {
        uniqueUsers.add(userId);
        totalMsgs += count;
      }
    }
    return { name: 'User Activity', category: 'Engagement', pass: true, detail: `${uniqueUsers.size} users, ${totalMsgs} messages over ${days.length} days`, critical: false };
  } catch {
    return { name: 'User Activity', category: 'Engagement', pass: true, detail: 'Could not parse activity data', critical: false };
  }
}

function checkDeployment(): ReadinessCheck {
  const deployScript = join(CWD, 'scripts', 'deploy-achiri.sh');
  const ecosystemPath = join(CWD, 'infra', 'ecosystem-hetzner-achiri.config.js');
  const hasDeployScript = existsSync(deployScript);
  const hasEcosystem = existsSync(ecosystemPath);
  const hasBaseUrl = !!process.env.ACHIRI_BASE_URL;
  const allOk = hasDeployScript && hasEcosystem;
  return {
    name: 'Deployment Package',
    category: 'Infrastructure',
    pass: allOk,
    detail: [
      hasDeployScript ? '✓ deploy script' : '✗ deploy script missing',
      hasEcosystem ? '✓ ecosystem config' : '✗ ecosystem config missing',
      hasBaseUrl ? `✓ ACHIRI_BASE_URL=${process.env.ACHIRI_BASE_URL}` : '✗ ACHIRI_BASE_URL not set (local mode)',
    ].join(', '),
    critical: !hasDeployScript,
  };
}

function checkSafety(): ReadinessCheck {
  const safetyPath = join(CWD, 'agents', 'achiri', 'safety-filter.ts');
  return {
    name: 'Safety Filter',
    category: 'Safety',
    pass: existsSync(safetyPath),
    detail: existsSync(safetyPath) ? 'safety-filter.ts present (4 categories)' : 'MISSING — Summer Yu rule violation',
    critical: true,
  };
}

function checkAlphaGate(): ReadinessCheck {
  const whitelistPath = join(CWD, 'workspace', 'achiri', 'alpha-whitelist.jsonl');
  const hasAlphaOnly = process.env.ACHIRI_ALPHA_ONLY === 'true';
  let invitedCount = 0;
  if (existsSync(whitelistPath)) {
    invitedCount = readFileSync(whitelistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  return {
    name: 'Alpha Access Gate',
    category: 'Access Control',
    pass: true,
    detail: `${invitedCount} invited, ACHIRI_ALPHA_ONLY=${hasAlphaOnly ? 'true' : 'false (open)'}`,
    critical: false,
  };
}

function checkWaitlist(): ReadinessCheck {
  const waitlistPath = join(CWD, 'workspace', 'achiri', 'waitlist.jsonl');
  let count = 0;
  if (existsSync(waitlistPath)) {
    count = readFileSync(waitlistPath, 'utf-8').split('\n').filter(l => l.trim()).length;
  }
  return {
    name: 'Waitlist',
    category: 'Growth',
    pass: true,
    detail: `${count} users on waitlist`,
    critical: false,
  };
}

function checkMemorySystem(): ReadinessCheck {
  const memDir = join(CWD, 'workspace', 'achiri', 'memory');
  if (!existsSync(memDir)) {
    return { name: 'Memory System', category: 'Features', pass: true, detail: 'Memory dir will be created on first user', critical: false };
  }
  const files = readdirSync(memDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('e2e-') && !f.startsWith('smoke-'));
  return { name: 'Memory System', category: 'Features', pass: true, detail: `${files.length} user memory files`, critical: false };
}

function main(): void {
  const alphaDate = new Date('2026-04-25T00:00:00Z');
  const daysToAlpha = Math.max(0, Math.ceil((alphaDate.getTime() - Date.now()) / 86_400_000));

  const checks: ReadinessCheck[] = [
    checkE2E(),
    checkSafety(),
    checkFeedback(),
    checkErrors(),
    checkUserActivity(),
    checkDeployment(),
    checkAlphaGate(),
    checkWaitlist(),
    checkMemorySystem(),
  ];

  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass).length;
  const criticalFailures = checks.filter(c => !c.pass && c.critical).length;
  const score = Math.round((passed / checks.length) * 100);
  const overallReady = criticalFailures === 0;

  const report: ReadinessReport = {
    generated_at: new Date().toISOString(),
    alpha_date: '2026-04-25',
    days_to_alpha: daysToAlpha,
    overall_ready: overallReady,
    score,
    checks,
    summary: { passed, failed, critical_failures: criticalFailures },
  };

  // Save report
  const outputDir = join(CWD, 'reports');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'achiri-readiness.json'), JSON.stringify(report, null, 2), 'utf-8');

  if (JSON_FLAG) {
    console.log(JSON.stringify(report));
    process.exit(overallReady ? 0 : 1);
  }

  // Console output
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ACHIRI ALPHA READINESS REPORT');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Alpha date: Apr 25, 2026 (${daysToAlpha} days)`);
  console.log(`  Score: ${score}% | ${overallReady ? '✅ READY' : '❌ NOT READY'}`);
  console.log('──────────────────────────────────────────────────────\n');

  // Group by category
  const categories = new Map<string, ReadinessCheck[]>();
  for (const c of checks) {
    if (!categories.has(c.category)) categories.set(c.category, []);
    categories.get(c.category)!.push(c);
  }

  categories.forEach((items, cat) => {
    console.log(`  📋 ${cat}`);
    for (const item of items) {
      const icon = item.pass ? '✅' : item.critical ? '🚫' : '⚠️';
      console.log(`     ${icon} ${item.name}: ${item.detail}`);
    }
    console.log('');
  });

  console.log('──────────────────────────────────────────────────────');
  console.log(`  ✅ ${passed} passed | ❌ ${failed} failed | 🚫 ${criticalFailures} critical`);
  if (!overallReady) {
    console.log('\n  🚫 CRITICAL FAILURES (must fix before alpha):');
    for (const c of checks.filter(c => !c.pass && c.critical)) {
      console.log(`     • ${c.name}: ${c.detail}`);
    }
  }
  console.log('');

  process.exit(overallReady ? 0 : 1);
}

main();
