// validate-sprint-161.ts — Sprint 161: viral topics in daily digest
// Run: npx ts-node scripts/scs001/validate-sprint-161.ts

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

console.log('\n🔍 Sprint 161 — daily digest viral topics validation\n');

const src = readFileSync(join(ROOT, 'scripts/daily-digest.ts'), 'utf-8');

// 1. getViralTopics function exists
check(
  'daily-digest.ts contains getViralTopics function',
  /function getViralTopics/.test(src)
);

// 2. getViralTopics reads viral-topics.json
check(
  'getViralTopics reads viral-topics.json',
  /viral-topics\.json/.test(src)
);

// 3. buildDigest() calls getViralTopics
check(
  'buildDigest() calls getViralTopics()',
  /getViralTopics\(\)/.test(src.slice(src.indexOf('function buildDigest')))
);

// 4. digest contains Trending topics label
check(
  'digest injects Trending topics section',
  /Trending topics/.test(src)
);

console.log(`\n📊 Result: ${passed}/4 checks passed\n`);
if (failed > 0) {
  console.log(`❌ ${failed} check(s) failed — sprint NOT ready`);
  process.exit(1);
} else {
  console.log(`✅ All checks passed — Sprint 161 PASS`);
}
