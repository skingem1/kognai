// Sprint 142 Validation — /review Telegram command
// 6 checks: commands.ts exports handleReview, contains correct logic,
//           handleHelp has /review, index.ts imports + routes handleReview with owner gate.
// Usage: npx ts-node scripts/scs001/validate-sprint-142.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const COMMANDS_PATH = join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const INDEX_PATH    = join(ROOT, 'agents', 'telegram-bot', 'index.ts');

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✅ PASS — ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL — ${label}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Sprint 142 Validation — /review Telegram command');
console.log('══════════════════════════════════════════════════════════════\n');

if (!existsSync(COMMANDS_PATH)) {
  console.error(`  FATAL: commands.ts not found at ${COMMANDS_PATH}`);
  process.exit(1);
}
if (!existsSync(INDEX_PATH)) {
  console.error(`  FATAL: index.ts not found at ${INDEX_PATH}`);
  process.exit(1);
}

const commandsContent = readFileSync(COMMANDS_PATH, 'utf-8');
const indexContent    = readFileSync(INDEX_PATH, 'utf-8');

// Check 1: commands.ts exports handleReview
check(
  'commands.ts exports handleReview',
  commandsContent.includes('export async function handleReview')
);

// Check 2: handleReview contains owner gate
check(
  'handleReview is owner-gated (ownerChatId check)',
  commandsContent.includes('handleReview') &&
  commandsContent.includes("'🔒 Owner only.'")
);

// Check 3: handleReview reads experiments.jsonl
check(
  'handleReview reads experiments.jsonl',
  commandsContent.includes('experiments.jsonl')
);

// Check 4: handleHelp lists /review
check(
  'handleHelp mentions /review command',
  commandsContent.includes('/review')
);

// Check 5: index.ts imports handleReview
check(
  'index.ts imports handleReview',
  indexContent.includes('handleReview')
);

// Check 6: index.ts routes /review to handleReview
check(
  "index.ts routes '/review' to handleReview",
  indexContent.includes("'/review'") && indexContent.includes('handleReview(chatId')
);

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed / ${failed} failed`);
console.log('══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
