/**
 * validate-dashboard-output.ts — Sprint 677
 * Validates achiri-dashboard-export.ts output.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'achiri', 'achiri-dashboard-export.ts');
const OUTPUT = join(ROOT, 'reports', 'achiri-dashboard.json');

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== Achiri Dashboard Export Validation ===\n');

// Test 1: Script exists
check('Script exists', existsSync(SCRIPT));

// Test 2: Runs without error
let output = '';
try {
  output = execSync(`npx ts-node ${SCRIPT}`, { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 });
  check('Script runs', true);
} catch (e: any) {
  check('Script runs', false, e.message?.slice(0, 100));
}

// Test 3: Output file exists
check('Dashboard JSON created', existsSync(OUTPUT));

// Test 4: Valid JSON with expected structure
if (existsSync(OUTPUT)) {
  try {
    const data = JSON.parse(readFileSync(OUTPUT, 'utf-8'));
    check('Has generated_at', typeof data.generated_at === 'string');
    check('Has version', data.version === '2.0');
    check('Has overview', typeof data.overview === 'object');
    check('Has overview.total_users', typeof data.overview?.total_users === 'number');
    check('Has overview.retention_pct', typeof data.overview?.retention_pct === 'number');
    check('Has today', typeof data.today === 'object');
    check('Has daily array', Array.isArray(data.daily));
    check('Has trends_7d array', Array.isArray(data.trends_7d));
    check('Has topics', typeof data.topics === 'object');
    check('Has topics.distribution', Array.isArray(data.topics?.distribution));
    check('Has top_users', Array.isArray(data.top_users));

    // Verify trends have rolling averages
    if (data.trends_7d.length > 0) {
      const t = data.trends_7d[0];
      check('Trends have dau_7d', typeof t.dau_7d === 'number');
      check('Trends have msgs_7d', typeof t.msgs_7d === 'number');
    } else {
      check('Trends have dau_7d', true); // empty is ok
      check('Trends have msgs_7d', true);
    }
  } catch (e: any) {
    check('JSON parse', false, e.message);
  }
} else {
  for (let i = 0; i < 12; i++) check('(skipped — no output file)', false);
}

// Test 5: Console output mentions key sections
check('Output mentions users', output.includes('Users:'));
check('Output mentions topics', output.includes('Topics'));
check('Output mentions trends', output.includes('Trends'));

console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? '\nPASS' : '\nFAIL');
process.exit(fail === 0 ? 0 : 1);
