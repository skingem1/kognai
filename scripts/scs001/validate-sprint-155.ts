// validate-sprint-155.ts — Sprint 155 validation (5 checks)
// Run: npx ts-node scripts/scs001/validate-sprint-155.ts
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

console.log('\n=== Sprint 155 Validation ===\n');

// Check 1: scripts/posting-reminder.ts exists
const reminderPath = path.join(CWD, 'scripts', 'posting-reminder.ts');
check('scripts/posting-reminder.ts exists', fs.existsSync(reminderPath));

// Check 2: posting-reminder.ts reads publish-ledger.jsonl
if (fs.existsSync(reminderPath)) {
  const src = fs.readFileSync(reminderPath, 'utf-8');
  check('posting-reminder.ts reads publish-ledger.jsonl', src.includes('publish-ledger.jsonl'));
} else {
  check('posting-reminder.ts reads publish-ledger.jsonl', false, 'file missing');
}

// Check 3: posting-reminder.ts sends Telegram (has sendMessage path)
if (fs.existsSync(reminderPath)) {
  const src = fs.readFileSync(reminderPath, 'utf-8');
  check('posting-reminder.ts sends Telegram', src.includes('sendMessage'));
} else {
  check('posting-reminder.ts sends Telegram', false, 'file missing');
}

// Check 4: ecosystem.config.js contains kognai-post-noon
const ecoPath = path.join(CWD, 'ecosystem.config.js');
if (fs.existsSync(ecoPath)) {
  const eco = fs.readFileSync(ecoPath, 'utf-8');
  check('ecosystem.config.js contains kognai-post-noon', eco.includes('kognai-post-noon'));
} else {
  check('ecosystem.config.js contains kognai-post-noon', false, 'ecosystem.config.js missing');
}

// Check 5: ecosystem.config.js contains kognai-post-evening
if (fs.existsSync(ecoPath)) {
  const eco = fs.readFileSync(ecoPath, 'utf-8');
  check('ecosystem.config.js contains kognai-post-evening', eco.includes('kognai-post-evening'));
} else {
  check('ecosystem.config.js contains kognai-post-evening', false, 'ecosystem.config.js missing');
}

console.log(`\nResult: ${passed}/5 PASS, ${failed}/5 FAIL`);
if (failed === 0) {
  console.log('Sprint 155: ALL PASS ✅\n');
  process.exit(0);
} else {
  console.log('Sprint 155: FAILED ❌\n');
  process.exit(1);
}
