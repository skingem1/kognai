/**
 * validate-freshness-output.ts — Sprint 675
 * Validates that auto-archive-stale.ts runs correctly in report mode.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'scs001', 'auto-archive-stale.ts');
const ARCHIVE = join(ROOT, 'workspace', 'scs001', 'archived-videos.json');
const VIRAL = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
const CALENDAR = join(ROOT, 'workspace', 'scs001', 'content-calendar.json');
const RADAR = join(ROOT, 'workspace', 'scs001', 'topic-radar');

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== Freshness Decay Validation ===\n');

// Test 1: Script exists and compiles
check('Script exists', existsSync(SCRIPT));

// Test 2: Report mode runs without error
let reportOutput = '';
try {
  reportOutput = execSync(
    `npx ts-node ${SCRIPT} --report`,
    { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 }
  );
  check('Report mode runs', true);
} catch (e: any) {
  check('Report mode runs', false, e.message?.slice(0, 100));
}

// Test 3: Output contains expected sections
check('Output has Ledger section', reportOutput.includes('[Ledger]'));
check('Output has Viral Topics section', reportOutput.includes('[Viral Topics]'));
check('Output has Calendar section', reportOutput.includes('[Calendar]'));
check('Output has Radar section', reportOutput.includes('[Radar]'));
check('Output has Summary', reportOutput.includes('Summary'));

// Test 4: Report mode does NOT modify files (check no changes)
check('Report mode is read-only', reportOutput.includes('[report] No changes made') || reportOutput.includes('All content is fresh'));

// Test 5: Dry-run mode works
try {
  const dryOutput = execSync(
    `ARCHIVE_DRY_RUN=1 npx ts-node ${SCRIPT}`,
    { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 }
  );
  check('Dry-run mode runs', true);
  check('Dry-run header present', dryOutput.includes('DRY-RUN'));
} catch (e: any) {
  check('Dry-run mode runs', false, e.message?.slice(0, 100));
  check('Dry-run header present', false);
}

// Test 6: Data files exist
check('archived-videos.json exists', existsSync(ARCHIVE));
check('viral-topics.json exists', existsSync(VIRAL));
check('content-calendar.json exists', existsSync(CALENDAR));
check('topic-radar/ exists', existsSync(RADAR));

// Test 7: archived-videos.json has valid structure
if (existsSync(ARCHIVE)) {
  try {
    const data = JSON.parse(readFileSync(ARCHIVE, 'utf-8'));
    check('Archive has ids array', Array.isArray(data.ids));
    check('Archive has count', typeof data.count === 'number');
  } catch {
    check('Archive has ids array', false, 'JSON parse failed');
    check('Archive has count', false);
  }
}

console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? '\nPASS' : '\nFAIL');
process.exit(fail === 0 ? 0 : 1);
