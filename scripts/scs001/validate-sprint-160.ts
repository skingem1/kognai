// validate-sprint-160.ts — Sprint 160: /viral command validation
// Run: npx ts-node scripts/scs001/validate-sprint-160.ts

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

console.log('\n🔍 Sprint 160 — /viral command validation\n');

const commandsSrc = readFileSync(join(ROOT, 'agents/telegram-bot/commands.ts'), 'utf-8');
const indexSrc    = readFileSync(join(ROOT, 'agents/telegram-bot/index.ts'),    'utf-8');

// 1. commands.ts exports handleViral
check(
  'commands.ts exports handleViral',
  /export async function handleViral/.test(commandsSrc)
);

// 2. handleViral reads viral-topics.json
check(
  'handleViral reads viral-topics.json',
  /viral-topics\.json/.test(commandsSrc.slice(commandsSrc.indexOf('handleViral')))
);

// 3. handleViral uses statSync for freshness
check(
  'handleViral uses statSync for file freshness',
  /statSync/.test(commandsSrc.slice(commandsSrc.indexOf('handleViral')))
);

// 4. handleHelp contains /viral
check(
  'handleHelp contains /viral',
  /\/viral/.test(commandsSrc) && /trending topics/.test(commandsSrc)
);

// 5. index.ts routes /viral
check(
  "index.ts routes '/viral'",
  /case '\/viral'/.test(indexSrc) && /handleViral/.test(indexSrc)
);

console.log(`\n📊 Result: ${passed}/5 checks passed\n`);
if (failed > 0) {
  console.log(`❌ ${failed} check(s) failed — sprint NOT ready`);
  process.exit(1);
} else {
  console.log(`✅ All checks passed — Sprint 160 PASS`);
}
