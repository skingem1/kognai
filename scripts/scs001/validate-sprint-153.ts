// Sprint 153 Validation — /tiktok-status TikTok live mode readiness
// Run: npx ts-node scripts/scs001/validate-sprint-153.ts

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

console.log('\nSprint 153 Validation — /tiktok-status\n');

const cmds = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
const idx  = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');

// 1. commands.ts exports handleTiktokStatus
check('commands.ts exports handleTiktokStatus', cmds.includes('export async function handleTiktokStatus'));

// 2. commands.ts checks TIKTOK_ACCESS_TOKEN
check('commands.ts checks TIKTOK_ACCESS_TOKEN', cmds.includes('TIKTOK_ACCESS_TOKEN'));

// 3. handleHelp contains /tiktok-status
check("handleHelp contains '/tiktok-status'", cmds.includes("'/tiktok-status —"));

// 4. index.ts routes /tiktok-status
check("index.ts routes /tiktok-status", idx.includes("case '/tiktok-status'"));

// 5. handleTiktokStatus shows gate progress
check('handleTiktokStatus shows gate progress (manual.count)', cmds.includes('manual.count'));

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
if (failed > 0) process.exit(1);
