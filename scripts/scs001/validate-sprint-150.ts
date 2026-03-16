// Sprint 150 Validation — /queue posting queue command
// Run: npx ts-node scripts/scs001/validate-sprint-150.ts

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function check(name: string, result: boolean, detail?: string): void {
  if (result) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\nSprint 150 Validation — /queue posting queue\n');

const cmds = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
const idx  = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');

// 1. commands.ts exports handleQueue
check('commands.ts exports handleQueue', cmds.includes('export async function handleQueue'));

// 2. commands.ts reads publish-ledger.jsonl
check('commands.ts reads publish-ledger.jsonl', cmds.includes('publish-ledger.jsonl'));

// 3. commands.ts computes pace (pacePerDay)
check('commands.ts computes daily pace (pacePerDay)', cmds.includes('pacePerDay'));

// 4. index.ts routes /queue
check("index.ts routes /queue", idx.includes("case '/queue'"));

// 5. handleHelp contains /queue
check('handleHelp contains /queue', cmds.includes("'/queue —"));

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
if (failed > 0) process.exit(1);
