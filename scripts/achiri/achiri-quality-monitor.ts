// Sprint 317 — achiri-quality-monitor.ts
// Batch evaluates real Achiri conversations from memory files using eval-harness ($0).
// Filters out test/e2e users. Reports per-user quality, aggregate stats, flag frequency.
// Run: npx ts-node scripts/achiri/achiri-quality-monitor.ts [--json]

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { evalResponse, batchEval, EvalResult, BatchEvalResult } from '../../agents/achiri/eval-harness';

const MEMORY_DIR = join(process.cwd(), 'workspace', 'achiri', 'memory');

function isRealUser(filename: string): boolean {
  if (filename.startsWith('e2e-')) return false;
  if (filename.startsWith('validate-')) return false;
  if (filename.startsWith('smoke-test')) return false;
  if (filename === 'anonymous.jsonl') return false;
  return filename.endsWith('.jsonl');
}

interface Turn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface UserQuality {
  userId: string;
  pairs: number;
  avg_score: number;
  pass_rate_pct: number;
  top_flags: string[];
}

interface QualityReport {
  generated_at: string;
  total_users: number;
  total_pairs: number;
  aggregate: BatchEvalResult;
  per_user: UserQuality[];
}

function loadConversationPairs(filepath: string): Array<{ user: string; reply: string }> {
  const lines = readFileSync(filepath, 'utf-8').split('\n').filter(l => l.trim());
  const turns: Turn[] = [];
  for (const line of lines) {
    try {
      turns.push(JSON.parse(line));
    } catch { /* skip malformed */ }
  }

  const pairs: Array<{ user: string; reply: string }> = [];
  for (let i = 0; i < turns.length - 1; i++) {
    if (turns[i].role === 'user' && turns[i + 1].role === 'assistant') {
      pairs.push({ user: turns[i].content, reply: turns[i + 1].content });
    }
  }
  return pairs;
}

function analyze(): QualityReport {
  if (!existsSync(MEMORY_DIR)) {
    return {
      generated_at: new Date().toISOString(),
      total_users: 0, total_pairs: 0,
      aggregate: { total: 0, passed: 0, pass_rate_pct: 0, avg_score: 0, min_score: 0, max_score: 0, flag_frequency: {} },
      per_user: [],
    };
  }

  const files = readdirSync(MEMORY_DIR).filter(isRealUser);
  const allPairs: Array<{ user: string; reply: string }> = [];
  const perUser: UserQuality[] = [];

  for (const file of files) {
    const userId = file.replace('.jsonl', '');
    const pairs = loadConversationPairs(join(MEMORY_DIR, file));
    if (pairs.length === 0) continue;

    allPairs.push(...pairs);
    const result = batchEval(pairs);
    const topFlags = Object.entries(result.flag_frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f]) => f);

    perUser.push({
      userId,
      pairs: pairs.length,
      avg_score: result.avg_score,
      pass_rate_pct: result.pass_rate_pct,
      top_flags: topFlags,
    });
  }

  const aggregate = batchEval(allPairs);

  perUser.sort((a, b) => b.avg_score - a.avg_score);

  return {
    generated_at: new Date().toISOString(),
    total_users: perUser.length,
    total_pairs: allPairs.length,
    aggregate,
    per_user: perUser,
  };
}

function printReport(r: QualityReport): void {
  console.log('══════════════════════════════════════════════════════');
  console.log('  ACHIRI QUALITY MONITOR');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Users: ${r.total_users} | Pairs evaluated: ${r.total_pairs}`);
  console.log(`  Avg score: ${r.aggregate.avg_score}/100 | Pass rate: ${r.aggregate.pass_rate_pct}%`);
  console.log(`  Range: ${r.aggregate.min_score}–${r.aggregate.max_score}`);
  console.log('──────────────────────────────────────────────────────');

  if (r.per_user.length > 0) {
    console.log('\n  👥 Per-User Quality');
    for (const u of r.per_user) {
      const icon = u.pass_rate_pct >= 70 ? '✅' : u.pass_rate_pct >= 50 ? '⚠️' : '❌';
      console.log(`     ${icon} ${u.userId}: avg ${u.avg_score}, ${u.pass_rate_pct}% pass (${u.pairs} pairs)`);
      if (u.top_flags.length > 0) {
        console.log(`        Flags: ${u.top_flags.join(', ')}`);
      }
    }
  }

  if (Object.keys(r.aggregate.flag_frequency).length > 0) {
    console.log('\n  🚩 Most Common Flags');
    const sorted = Object.entries(r.aggregate.flag_frequency).sort((a, b) => b[1] - a[1]);
    for (const [flag, count] of sorted.slice(0, 8)) {
      const pct = r.total_pairs > 0 ? Math.round((count / r.total_pairs) * 100) : 0;
      console.log(`     ${flag}: ${count}× (${pct}%)`);
    }
  }

  console.log('\n──────────────────────────────────────────────────────');
  const verdict = r.aggregate.pass_rate_pct >= 70 ? '✅ QUALITY OK' : '⚠️ QUALITY NEEDS WORK';
  console.log(`  ${verdict} (target: ≥70% pass rate)`);
  console.log('──────────────────────────────────────────────────────');
}

// Main
const report = analyze();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}
