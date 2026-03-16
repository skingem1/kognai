// Sprint 138 Validation — Cadence tracker + /achiri-health command
// Usage: npx ts-node scripts/achiri/validate-sprint-138.ts

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
console.log('  Sprint 138 Validation — Cadence + /achiri-health');
console.log('══════════════════════════════════════════════════════\n');

// ── Task 138-01: record-manual-post.ts cadence ────────────────────────────────
const recordPost = readFileSync(resolve('scripts/scs001/record-manual-post.ts'), 'utf-8');

check(
  '138-01a: record-manual-post.ts contains "Cadence needed" string',
  recordPost.includes('Cadence needed')
);

check(
  '138-01b: record-manual-post.ts contains Apr 7 date logic (APR_7 or 2026-04-07)',
  recordPost.includes('APR_7') || recordPost.includes('2026-04-07')
);

check(
  '138-01c: record-manual-post.ts contains daysToGate computation',
  recordPost.includes('daysToGate')
);

// ── Task 138-02: commands.ts handleAchiriHealth ───────────────────────────────
const commands = readFileSync(resolve('agents/telegram-bot/commands.ts'), 'utf-8');

check(
  '138-02a: commands.ts exports handleAchiriHealth function',
  commands.includes('export async function handleAchiriHealth')
);

check(
  '138-02b: handleAchiriHealth fetches /health endpoint',
  commands.includes("'/health'") || commands.includes('"/health"') || commands.includes("+ '/health'") || commands.includes('+ "/health"')
);

check(
  '138-02c: /achiri-health appears in handleHelp() output',
  commands.includes('/achiri-health')
);

// ── Task 138-02: index.ts routing ─────────────────────────────────────────────
const indexTs = readFileSync(resolve('agents/telegram-bot/index.ts'), 'utf-8');

check(
  '138-02d: index.ts imports handleAchiriHealth',
  indexTs.includes('handleAchiriHealth')
);

check(
  "138-02e: index.ts routes '/achiri-health' case",
  indexTs.includes("'/achiri-health'") || indexTs.includes('"/achiri-health"')
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n  ✓ Sprint 138 PASS — all checks green\n');
  process.exit(0);
} else {
  console.log('\n  ✗ Sprint 138 FAIL — fix failures above\n');
  process.exit(1);
}
