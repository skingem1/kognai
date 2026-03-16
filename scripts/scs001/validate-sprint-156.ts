// validate-sprint-156.ts — Sprint 156 validation (5 checks)
// Run: npx ts-node scripts/scs001/validate-sprint-156.ts
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

console.log('\n=== Sprint 156 Validation ===\n');

const commandsPath = path.join(CWD, 'agents', 'telegram-bot', 'commands.ts');
const indexPath    = path.join(CWD, 'agents', 'telegram-bot', 'index.ts');

const commandsSrc = fs.existsSync(commandsPath) ? fs.readFileSync(commandsPath, 'utf-8') : '';
const indexSrc    = fs.existsSync(indexPath)    ? fs.readFileSync(indexPath, 'utf-8')    : '';

// Check 1: commands.ts exports handleCaption
check('commands.ts exports handleCaption', commandsSrc.includes('export async function handleCaption'));

// Check 2: handleCaption reads viral-topics.json for hashtags
check('handleCaption reads viral-topics.json', commandsSrc.includes('viral-topics.json'));

// Check 3: handleCaption reads publish-ledger.jsonl
check('handleCaption reads publish-ledger.jsonl', commandsSrc.includes('publish-ledger.jsonl'));

// Check 4: handleHelp contains /caption
check('handleHelp contains /caption', commandsSrc.includes('/caption'));

// Check 5: index.ts routes /caption
check("index.ts routes '/caption'", indexSrc.includes("'/caption'") || indexSrc.includes('"/caption"'));

console.log(`\nResult: ${passed}/5 PASS, ${failed}/5 FAIL`);
if (failed === 0) {
  console.log('Sprint 156: ALL PASS ✅\n');
  process.exit(0);
} else {
  console.log('Sprint 156: FAILED ❌\n');
  process.exit(1);
}
