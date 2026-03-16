// Sprint 151 Validation — daily-digest.ts: queue stats + Stripe status + tip update
// Run: npx ts-node scripts/scs001/validate-sprint-151.ts

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

console.log('\nSprint 151 Validation — daily-digest.ts enhancements\n');

const src = fs.readFileSync(path.join(ROOT, 'scripts', 'daily-digest.ts'), 'utf-8');

// 1. getQueueStats function exists
check('daily-digest.ts contains getQueueStats', src.includes('function getQueueStats'));

// 2. unposted variable used
check('daily-digest.ts computes unposted count', src.includes('unposted'));

// 3. STRIPE_SECRET_KEY env check exists
check('daily-digest.ts contains STRIPE_SECRET_KEY check', src.includes('STRIPE_SECRET_KEY'));

// 4. /queue mentioned in tip
check('daily-digest.ts tip includes /queue', src.includes('/queue'));

// 5. DRY_RUN output contains Queue: and Stripe:
let dryRunOutput = '';
try {
  dryRunOutput = execSync(
    'DIGEST_DRY_RUN=1 npx ts-node scripts/daily-digest.ts',
    { cwd: ROOT, encoding: 'utf-8', timeout: 30000 }
  );
} catch { /* already handled below */ }

check('DRY_RUN output contains "Queue:"', dryRunOutput.includes('Queue:'));
check('DRY_RUN output contains "Stripe:"', dryRunOutput.includes('Stripe:'));

console.log(`\nResult: ${passed}/${passed + failed} checks passed\n`);
if (failed > 0) process.exit(1);
