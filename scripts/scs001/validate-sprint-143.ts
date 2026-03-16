// Sprint 143 Validation — /record Telegram command
// 6 checks: commands.ts exports handleRecord with owner gate + writes to manual-posts.jsonl,
//           handleHelp has /record, index.ts imports + routes handleRecord.
// Usage: npx ts-node scripts/scs001/validate-sprint-143.ts

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
console.log('  Sprint 143 Validation — /record Telegram command');
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

// Check 1: commands.ts exports handleRecord
check(
  'commands.ts exports handleRecord',
  commandsContent.includes('export async function handleRecord')
);

// Check 2: handleRecord is owner-gated
check(
  'handleRecord is owner-gated (ownerChatId check)',
  commandsContent.includes('handleRecord') &&
  commandsContent.includes("'🔒 Owner only.'")
);

// Check 3: handleRecord writes to manual-posts.jsonl
check(
  'handleRecord writes to manual-posts.jsonl',
  commandsContent.includes('manual-posts.jsonl') &&
  commandsContent.includes('appendFileSync')
);

// Check 4: handleHelp lists /record
check(
  'handleHelp mentions /record command',
  commandsContent.includes('/record')
);

// Check 5: index.ts imports handleRecord
check(
  'index.ts imports handleRecord',
  indexContent.includes('handleRecord')
);

// Check 6: index.ts routes /record to handleRecord
check(
  "index.ts routes '/record' to handleRecord",
  indexContent.includes("'/record'") && indexContent.includes('handleRecord(chatId')
);

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed / ${failed} failed`);
console.log('══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
