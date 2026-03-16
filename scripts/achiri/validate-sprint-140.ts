// Sprint 140 Validation — /post-reminder Telegram command
// Usage: npx ts-node scripts/achiri/validate-sprint-140.ts

import { readFileSync } from 'fs';
import { resolve } from 'path';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  Sprint 140 Validation — /post-reminder command');
console.log('══════════════════════════════════════════════════════\n');

const commands = readFileSync(resolve('agents/telegram-bot/commands.ts'), 'utf-8');
const indexTs  = readFileSync(resolve('agents/telegram-bot/index.ts'), 'utf-8');

check(
  '140-01a: commands.ts exports handlePostReminder',
  commands.includes('export async function handlePostReminder')
);

check(
  '140-01b: handlePostReminder reads manual-posts.jsonl',
  commands.includes('manual-posts.jsonl')
);

check(
  '140-01c: handlePostReminder reads publish-ledger.jsonl',
  commands.includes('publish-ledger.jsonl')
);

check(
  '140-01d: handlePostReminder computes cadence (APR_7)',
  commands.includes('APR_7') || commands.includes('2026-04-07')
);

check(
  "140-01e: /post-reminder appears in handleHelp()",
  commands.includes('/post-reminder')
);

check(
  '140-02a: index.ts imports handlePostReminder',
  indexTs.includes('handlePostReminder')
);

check(
  "140-02b: index.ts routes '/post-reminder'",
  indexTs.includes("'/post-reminder'") || indexTs.includes('"/post-reminder"')
);

console.log(`\n  Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n  ✓ Sprint 140 PASS — all checks green\n');
  process.exit(0);
} else {
  console.log('\n  ✗ Sprint 140 FAIL — fix failures above\n');
  process.exit(1);
}
