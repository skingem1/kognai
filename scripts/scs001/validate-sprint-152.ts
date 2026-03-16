// Sprint 152 Validation — urgency fix + inline top-3 queue on WARNING
// Run: npx ts-node scripts/scs001/validate-sprint-152.ts

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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

console.log('\nSprint 152 Validation — digest urgency fix + inline queue\n');

const src = fs.readFileSync(path.join(ROOT, 'scripts', 'daily-digest.ts'), 'utf-8');

// 1. Urgency checks gate.count === 0
check('urgency signal checks gate.count === 0', src.includes('gate.count === 0'));

// 2. getQueueStats returns top3
check('getQueueStats returns top3 array', src.includes('top3'));

// 3. Digest has inline "Post these now" section
check('digest has "Post these now" inline section', src.includes('Post these now'));

// 4 + 5. DRY_RUN output
let out = '';
try {
  out = execSync('DIGEST_DRY_RUN=1 npx ts-node scripts/daily-digest.ts', {
    cwd: ROOT, encoding: 'utf-8', timeout: 30000,
  });
} catch { /* handled below */ }

check('DRY_RUN output shows WARNING (0 posts → warns)', out.includes('WARNING'));
check('DRY_RUN output includes /record shortcuts', out.includes('/record '));

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
if (failed > 0) process.exit(1);
