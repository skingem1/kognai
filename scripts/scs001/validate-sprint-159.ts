// validate-sprint-159.ts — Sprint 159: /today command validation
// Run: npx ts-node scripts/scs001/validate-sprint-159.ts

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

console.log('\n🔍 Sprint 159 — /today command validation\n');

const commandsSrc = readFileSync(join(ROOT, 'agents/telegram-bot/commands.ts'), 'utf-8');
const indexSrc    = readFileSync(join(ROOT, 'agents/telegram-bot/index.ts'),    'utf-8');

// 1. commands.ts exports handleToday
check(
  'commands.ts exports handleToday',
  /export async function handleToday/.test(commandsSrc)
);

// 2. handleToday reads publish-ledger.jsonl
check(
  'handleToday reads publish-ledger.jsonl',
  /publish-ledger\.jsonl/.test(commandsSrc)
);

// 3. handleToday reads viral-topics.json
check(
  'handleToday reads viral-topics.json',
  /viral-topics\.json/.test(commandsSrc)
);

// 4. handleHelp contains /today
check(
  'handleHelp contains /today',
  /\/today/.test(commandsSrc) && /morning cockpit/.test(commandsSrc)
);

// 5. index.ts routes /today
check(
  "index.ts routes '/today'",
  /case '\/today'/.test(indexSrc) && /handleToday/.test(indexSrc)
);

console.log(`\n📊 Result: ${passed}/5 checks passed\n`);
if (failed > 0) {
  console.log(`❌ ${failed} check(s) failed — sprint NOT ready`);
  process.exit(1);
} else {
  console.log(`✅ All checks passed — Sprint 159 PASS`);
}
