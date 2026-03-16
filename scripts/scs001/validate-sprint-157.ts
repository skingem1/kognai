// validate-sprint-157.ts — Sprint 157 validation (3 checks)
// Run: npx ts-node scripts/scs001/validate-sprint-157.ts
import * as fs from 'fs';
import * as path from 'path';

const CWD = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, result: boolean, detail?: string): void {
  if (result) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\n=== Sprint 157 Validation ===\n');

const ecoPath = path.join(CWD, 'ecosystem.config.js');
const ecoSrc  = fs.existsSync(ecoPath) ? fs.readFileSync(ecoPath, 'utf-8') : '';

// Check 1: ecosystem.config.js contains kognai-brief-regen
check('ecosystem.config.js contains kognai-brief-regen', ecoSrc.includes('kognai-brief-regen'));

// Check 2: brief-regen uses cron_restart at 06:45
check("kognai-brief-regen cron is '45 6 * * *'", ecoSrc.includes('"45 6 * * *"') || ecoSrc.includes("'45 6 * * *'"));

// Check 3: scripts/generate-daily-brief.py exists
const briefScript = path.join(CWD, 'scripts', 'generate-daily-brief.py');
check('scripts/generate-daily-brief.py exists', fs.existsSync(briefScript));

console.log(`\nResult: ${passed}/3 PASS, ${failed}/3 FAIL`);
if (failed === 0) {
  console.log('Sprint 157: ALL PASS ✅\n');
  process.exit(0);
} else {
  console.log('Sprint 157: FAILED ❌\n');
  process.exit(1);
}
