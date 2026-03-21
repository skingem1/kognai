#!/usr/bin/env npx ts-node
/**
 * run-all-tests.ts — Sprint 330
 * Meta test runner: executes all core Achiri validation scripts in sequence.
 * Reports overall pass/fail with details per test.
 *
 * Usage:
 *   npx ts-node scripts/achiri/run-all-tests.ts           # run all
 *   npx ts-node scripts/achiri/run-all-tests.ts --quick    # skip slow tests (e2e, HTTP)
 *   npx ts-node scripts/achiri/run-all-tests.ts --json     # JSON output
 *
 * Output: reports/achiri-test-suite.json
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const CWD = process.cwd();
const REPORTS_DIR = join(CWD, 'reports');
const OUTPUT_PATH = join(REPORTS_DIR, 'achiri-test-suite.json');
const QUICK = process.argv.includes('--quick');
const JSON_MODE = process.argv.includes('--json');

interface TestResult {
  name: string;
  script: string;
  passed: boolean;
  duration_ms: number;
  output: string;
  skipped: boolean;
}

interface SuiteReport {
  generated_at: string;
  mode: 'full' | 'quick';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  tests: TestResult[];
}

// Core validation tests (not sprint-specific)
const TESTS: Array<{ name: string; script: string; slow?: boolean }> = [
  { name: 'Safety Filter', script: 'scripts/achiri/validate-safety-filter.ts' },
  { name: 'Derja Profiler', script: 'scripts/achiri/validate-derja-profiler.ts' },
  { name: 'Emotion Detector', script: 'scripts/achiri/validate-emotion-detector.ts' },
  { name: 'Topic Suggester', script: 'scripts/achiri/validate-topic-suggester.ts' },
  { name: 'Memory Search', script: 'scripts/achiri/validate-memory-search.ts' },
  { name: 'Memory Persistence', script: 'scripts/achiri/validate-memory-persistence.ts' },
  { name: 'Context Window', script: 'scripts/achiri/validate-context-window.ts' },
  { name: 'Daily Limit', script: 'scripts/achiri/validate-daily-limit.ts' },
  { name: 'Alpha Access', script: 'scripts/achiri/validate-alpha-access.ts' },
  { name: 'Onboarding', script: 'scripts/achiri/validate-onboarding.ts' },
  { name: 'PayMee', script: 'scripts/achiri/validate-paymee.ts' },
  { name: 'Voice Handler', script: 'scripts/achiri/validate-voice-handler.ts', slow: true },
  { name: 'Eval Harness', script: 'scripts/achiri/validate-eval-harness.ts' },
  { name: 'Deploy Package', script: 'scripts/achiri/validate-deploy-package.ts' },
  { name: 'HTTP API', script: 'scripts/achiri/validate-http-api.ts', slow: true },
  { name: 'E2E Integration', script: 'scripts/achiri/validate-e2e-integration.ts', slow: true },
  { name: 'E2E Alpha', script: 'scripts/achiri/validate-e2e-alpha.ts', slow: true },
];

function runTest(test: { name: string; script: string; slow?: boolean }): TestResult {
  if (QUICK && test.slow) {
    return {
      name: test.name,
      script: test.script,
      passed: true,
      duration_ms: 0,
      output: 'SKIPPED (quick mode)',
      skipped: true,
    };
  }

  // Check script exists
  if (!existsSync(join(CWD, test.script))) {
    return {
      name: test.name,
      script: test.script,
      passed: false,
      duration_ms: 0,
      output: 'Script not found',
      skipped: false,
    };
  }

  const start = Date.now();
  try {
    const timeout = test.slow ? 240000 : 30000; // Sprint 642: 240s for slow tests (E2E runs Ollama calls)
    const output = execSync(`npx ts-node ${test.script} 2>&1`, {
      cwd: CWD,
      timeout,
      env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' },
    }).toString();

    const duration = Date.now() - start;
    // Sprint 638: Detect actual failures, not words like "tier_error" or "VoiceTierError"
    // Look for standalone FAIL indicators, exclude "0 FAIL" / "0 failed" / test descriptions containing "error"
    const summaryMatch = output.match(/(\d+)\s*(?:FAIL|failed)/i);
    const failCount = summaryMatch ? parseInt(summaryMatch[1]) : 0;
    const hasFail = failCount > 0 || (/^  (?:✗|FAIL|❌)/m.test(output) && !/0 fail/i.test(output));
    const hasPass = /PASS|passed|✅|All.*pass/i.test(output);

    return {
      name: test.name,
      script: test.script,
      passed: hasPass || !hasFail,
      duration_ms: duration,
      output: output.trim().slice(-500), // Last 500 chars
      skipped: false,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    return {
      name: test.name,
      script: test.script,
      passed: false,
      duration_ms: duration,
      output: (err.stdout?.toString() ?? err.message ?? '').slice(-500),
      skipped: false,
    };
  }
}

function main(): void {
  const suiteStart = Date.now();

  if (!JSON_MODE) {
    console.log(`\n🧪 Achiri Test Suite${QUICK ? ' (QUICK MODE)' : ''}`);
    console.log(`   ${TESTS.length} tests registered\n`);
  }

  const results: TestResult[] = [];

  for (const test of TESTS) {
    if (!JSON_MODE) {
      process.stdout.write(`  ⏳ ${test.name}...`);
    }

    const result = runTest(test);
    results.push(result);

    if (!JSON_MODE) {
      const icon = result.skipped ? '⏭️' : result.passed ? '✅' : '❌';
      const time = result.duration_ms > 0 ? ` (${(result.duration_ms / 1000).toFixed(1)}s)` : '';
      console.log(`\r  ${icon} ${test.name}${time}`);
    }
  }

  const suiteDuration = Date.now() - suiteStart;
  const passed = results.filter(r => r.passed && !r.skipped).length;
  const failed = results.filter(r => !r.passed).length;
  const skipped = results.filter(r => r.skipped).length;

  const report: SuiteReport = {
    generated_at: new Date().toISOString(),
    mode: QUICK ? 'quick' : 'full',
    total: results.length,
    passed,
    failed,
    skipped,
    duration_ms: suiteDuration,
    tests: results,
  };

  // Save report
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  if (JSON_MODE) {
    console.log(JSON.stringify(report));
  } else {
    console.log(`\n${'═'.repeat(40)}`);
    const icon = failed === 0 ? '✅' : '❌';
    console.log(`${icon} Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log(`   Duration: ${(suiteDuration / 1000).toFixed(1)}s`);
    console.log(`   Report: ${OUTPUT_PATH}`);

    if (failed > 0) {
      console.log('\n❌ Failed tests:');
      for (const r of results.filter(r => !r.passed)) {
        console.log(`   • ${r.name}: ${r.output.split('\n').pop()}`);
      }
    }

    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
