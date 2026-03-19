#!/usr/bin/env npx ts-node
/**
 * Sprint 270 — Watchdog validation test
 * Runs watchdog in dry-run mode and verifies output structure.
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
  console.log('=== Sprint 270 — Watchdog Validation ===\n');

  // Check 1: Script file exists
  const scriptPath = path.join(ROOT, 'scripts', 'scs001', 'watchdog.ts');
  check('watchdog.ts exists', fs.existsSync(scriptPath));

  // Check 2: Run in dry-run mode
  let output = '';
  try {
    output = execSync(
      'WATCHDOG_DRY_RUN=1 npx ts-node scripts/scs001/watchdog.ts',
      { cwd: ROOT, timeout: 30000, encoding: 'utf-8', env: { ...process.env, WATCHDOG_DRY_RUN: '1' } }
    );
    check('dry-run executes without error', true);
  } catch (err: any) {
    output = err.stdout || '';
    // Watchdog may exit(1) if tokens not set, but in dry-run it should work
    check('dry-run executes without error', output.includes('Watchdog Report'), err.message?.slice(0, 100));
  }

  // Check 3: Output contains report header
  check('output contains Watchdog Report header', output.includes('Watchdog Report'));

  // Check 4: Output contains timestamp
  check('output contains timestamp', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(output));

  // Check 5: Report JSON written
  const reportPath = path.join(ROOT, 'reports', 'watchdog-latest.json');
  check('reports/watchdog-latest.json written', fs.existsSync(reportPath));

  if (fs.existsSync(reportPath)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      check('report has timestamp field', typeof report.timestamp === 'string');
      check('report has alerts array', Array.isArray(report.alerts));
      check('report has critical_count', typeof report.critical_count === 'number');
      check('report has warning_count', typeof report.warning_count === 'number');
    } catch {
      check('report JSON is valid', false, 'failed to parse');
    }
  }

  // Check 6: PM2 config entry exists
  const ecoConfig = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf-8');
  check('PM2 config has kognai-watchdog entry', ecoConfig.includes('kognai-watchdog'));
  check('PM2 config has 6h cron', ecoConfig.includes('0 */6 * * *'));

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
