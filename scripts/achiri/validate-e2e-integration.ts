#!/usr/bin/env npx ts-node
/**
 * Sprint 272 — Achiri E2E integration validation wrapper
 * Runs the E2E test and verifies report output.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function main(): Promise<void> {
  console.log('=== Sprint 272 — Achiri E2E Integration Validation ===\n');

  // Check 1: Test script exists
  const testPath = path.join(ROOT, 'scripts', 'achiri', 'e2e-integration-test.ts');
  check('e2e-integration-test.ts exists', fs.existsSync(testPath));

  // Check 2: Run the E2E test
  let output = '';
  let exitCode = 0;
  try {
    output = execSync(
      'npx ts-node scripts/achiri/e2e-integration-test.ts',
      { cwd: ROOT, timeout: 180000, encoding: 'utf-8' }
    );
    check('E2E test executes without error', true);
  } catch (err: any) {
    output = err.stdout || '';
    exitCode = err.status || 1;
    // Component tests should pass even without server
    check('E2E test executes', output.includes('Results:'), err.message?.slice(0, 100));
  }

  // Check 3: Output contains expected sections
  check('output contains Component Tests', output.includes('Component Tests'));
  check('output contains Results summary', output.includes('Results:'));

  // Check 4: Report JSON written
  const reportPath = path.join(ROOT, 'reports', 'achiri-e2e-latest.json');
  check('reports/achiri-e2e-latest.json written', fs.existsSync(reportPath));

  if (fs.existsSync(reportPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      check('report has timestamp', typeof report.timestamp === 'string');
      check('report has passed count', typeof report.passed === 'number');
      check('report has failed count', typeof report.failed === 'number');
      check('report has total count', typeof report.total === 'number');
      check('component tests all pass', report.failed === 0, `${report.failed} failures`);
    } catch {
      check('report JSON is valid', false, 'parse error');
    }
  }

  console.log(`\n=== Validation: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
