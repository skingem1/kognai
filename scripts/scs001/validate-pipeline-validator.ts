#!/usr/bin/env npx ts-node
/**
 * validate-pipeline-validator.ts — Sprint 685
 * Validates the pipeline output validator script.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..', '..');
let pass = true;
const results: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  const icon = ok ? 'PASS' : 'FAIL';
  results.push(`[${icon}] ${name}: ${detail}`);
  if (!ok) pass = false;
}

// Test 1: Script exists and has key functions
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'scs001', 'pipeline-output-validator.ts'), 'utf-8');
check('has-ffprobe', src.includes('ffprobe'), 'Uses ffprobe for validation');
check('has-probe-function', src.includes('function probeVideo'), 'probeVideo function exists');
check('has-find-videos', src.includes('function findVideos'), 'findVideos function exists');
check('has-recent-flag', src.includes('--recent'), 'Supports --recent flag');
check('has-telegram-flag', src.includes('--telegram'), 'Supports --telegram flag');
check('has-size-check', src.includes('100_000') || src.includes('100000'), 'Checks file size > 100KB');
check('has-duration-check', src.includes('duration < 5'), 'Checks duration > 5s');
check('has-report-output', src.includes('video-validation.json'), 'Writes report JSON');

// Test 2: Run it and verify output
try {
  const output = execSync(
    `cd "${ROOT}" && npx ts-node scripts/scs001/pipeline-output-validator.ts --recent 3 2>&1`,
    { encoding: 'utf-8', timeout: 60000 }
  );
  check('runs-successfully', output.includes('Video Validation Report'), 'Script runs and produces report');

  // Check report file exists
  const reportPath = path.join(ROOT, 'reports', 'video-validation.json');
  const reportExists = fs.existsSync(reportPath);
  check('report-exists', reportExists, reportExists ? 'Report JSON written' : 'Report JSON not found');

  if (reportExists) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    check('report-has-total', typeof report.total === 'number', `Total: ${report.total}`);
    check('report-has-valid', typeof report.valid === 'number', `Valid: ${report.valid}`);
    check('report-has-pass-rate', typeof report.pass_rate === 'number', `Pass rate: ${report.pass_rate}%`);
    check('pass-rate-reasonable', report.pass_rate >= 80, `Pass rate ${report.pass_rate}% >= 80%`);
  }
} catch (err: any) {
  check('runs-successfully', false, `Script failed: ${err.message?.slice(0, 200)}`);
}

console.log('\n=== Pipeline Validator Test ===');
results.forEach(r => console.log(r));
console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
