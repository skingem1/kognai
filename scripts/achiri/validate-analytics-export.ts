/**
 * validate-analytics-export.ts — Sprint 1438
 * Validates the output of export-analytics.ts.
 * Runs the export and checks the resulting JSON for required fields.
 *
 * Usage: npx ts-node scripts/achiri/validate-analytics-export.ts
 * Exit 0 on PASS, exit 1 on any FAIL.
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const REPORT_PATH = join(ROOT, 'reports', 'achiri-analytics.json');

interface Check { name: string; pass: boolean; detail: string; }

function check(name: string, pass: boolean, detail: string): Check {
  const label = pass ? 'PASS' : 'FAIL';
  console.log(`  [${label}] ${name} — ${detail}`);
  return { name, pass, detail };
}

async function main() {
  console.log('=== Achiri Analytics Validator ===\n');

  // Run the export first
  try {
    const { exportAchiriAnalytics } = require('./export-analytics');
    exportAchiriAnalytics();
  } catch (e: any) {
    console.log(`  [FAIL] export run — ${e.message}`);
    process.exit(1);
  }

  const checks: Check[] = [];

  // 1. File exists
  checks.push(check('file exists', existsSync(REPORT_PATH), REPORT_PATH));
  if (!existsSync(REPORT_PATH)) { process.exit(1); }

  // 2. Parse JSON
  let data: any;
  try {
    data = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
    checks.push(check('valid JSON', true, 'parsed ok'));
  } catch (e: any) {
    checks.push(check('valid JSON', false, e.message));
    process.exit(1);
  }

  // 3. Required fields
  checks.push(check('generated_at is ISO string', typeof data.generated_at === 'string' && data.generated_at.includes('T'), data.generated_at || 'missing'));
  checks.push(check('overview.total_users >= 0', typeof data.overview?.total_users === 'number' && data.overview.total_users >= 0, `${data.overview?.total_users}`));
  checks.push(check('overview.retention_pct 0-100', typeof data.overview?.retention_pct === 'number' && data.overview.retention_pct >= 0 && data.overview.retention_pct <= 100, `${data.overview?.retention_pct}%`));
  checks.push(check('daily is array', Array.isArray(data.daily), `${data.daily?.length ?? 'missing'} days`));
  checks.push(check('top_users is array', Array.isArray(data.top_users), `${data.top_users?.length ?? 'missing'} entries`));

  const failed = checks.filter(c => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  if (failed.length > 0) {
    console.log('\nFailed checks:');
    failed.forEach(c => console.log(`  ✗ ${c.name}: ${c.detail}`));
    process.exit(1);
  } else {
    console.log('\nAll checks PASSED ✓');
    process.exit(0);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
