// Sprint 144 Validation — /update-views Telegram command + daily-digest hint update
// 7 checks.
// Usage: npx ts-node scripts/scs001/validate-sprint-144.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const COMMANDS_PATH = join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const INDEX_PATH    = join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const DIGEST_PATH   = join(ROOT, 'scripts', 'daily-digest.ts');

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
console.log('  Sprint 144 Validation — /update-views + daily-digest hint');
console.log('══════════════════════════════════════════════════════════════\n');

for (const [label, p] of [['commands.ts', COMMANDS_PATH], ['index.ts', INDEX_PATH], ['daily-digest.ts', DIGEST_PATH]] as [string, string][]) {
  if (!existsSync(p)) { console.error(`  FATAL: ${label} not found at ${p}`); process.exit(1); }
}

const commandsContent = readFileSync(COMMANDS_PATH, 'utf-8');
const indexContent    = readFileSync(INDEX_PATH, 'utf-8');
const digestContent   = readFileSync(DIGEST_PATH, 'utf-8');

// Check 1: commands.ts exports handleUpdateViews
check(
  'commands.ts exports handleUpdateViews',
  commandsContent.includes('export async function handleUpdateViews')
);

// Check 2: handleUpdateViews is owner-gated
check(
  'handleUpdateViews is owner-gated (ownerChatId check)',
  commandsContent.includes('handleUpdateViews') &&
  commandsContent.includes("'🔒 Owner only.'")
);

// Check 3: handleUpdateViews uses writeFileSync (rewrites file)
check(
  'handleUpdateViews uses writeFileSync to rewrite manual-posts.jsonl',
  commandsContent.includes('writeFileSync') &&
  commandsContent.includes('handleUpdateViews')
);

// Check 4: handleHelp lists /update-views
check(
  'handleHelp mentions /update-views command',
  commandsContent.includes('/update-views')
);

// Check 5: index.ts imports handleUpdateViews
check(
  'index.ts imports handleUpdateViews',
  indexContent.includes('handleUpdateViews')
);

// Check 6: index.ts routes /update-views
check(
  "index.ts routes '/update-views' to handleUpdateViews",
  indexContent.includes("'/update-views'") && indexContent.includes('handleUpdateViews(chatId')
);

// Check 7: daily-digest.ts mentions /review in hint
check(
  'daily-digest.ts tip mentions /review Telegram command',
  digestContent.includes('/review')
);

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`  Results: ${passed} passed / ${failed} failed`);
console.log('══════════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
