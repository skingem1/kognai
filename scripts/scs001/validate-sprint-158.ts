// validate-sprint-158.ts — Sprint 158 validation (5 checks)
// Run: npx ts-node scripts/scs001/validate-sprint-158.ts
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

console.log('\n=== Sprint 158 Validation ===\n');

const commandsPath = path.join(CWD, 'agents', 'telegram-bot', 'commands.ts');
const indexPath    = path.join(CWD, 'agents', 'telegram-bot', 'index.ts');

const commandsSrc = fs.existsSync(commandsPath) ? fs.readFileSync(commandsPath, 'utf-8') : '';
const indexSrc    = fs.existsSync(indexPath)    ? fs.readFileSync(indexPath, 'utf-8')    : '';

// Check 1: commands.ts exports handlePace
check('commands.ts exports handlePace', commandsSrc.includes('export async function handlePace'));

// Check 2: handlePace reads manual-posts.jsonl
check('handlePace reads manual-posts.jsonl', commandsSrc.includes('manual-posts.jsonl'));

// Check 3: handlePace computes daysLeft
check('handlePace computes daysLeft', commandsSrc.includes('daysLeft'));

// Check 4: handleHelp contains /pace
check('handleHelp contains /pace', commandsSrc.includes('/pace'));

// Check 5: index.ts routes /pace
check("index.ts routes '/pace'", indexSrc.includes("'/pace'") || indexSrc.includes('"/pace"'));

console.log(`\nResult: ${passed}/5 PASS, ${failed}/5 FAIL`);
if (failed === 0) {
  console.log('Sprint 158: ALL PASS ✅\n');
  process.exit(0);
} else {
  console.log('Sprint 158: FAILED ❌\n');
  process.exit(1);
}
