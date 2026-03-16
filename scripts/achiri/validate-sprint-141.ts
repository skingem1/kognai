// Sprint 141 Validation — Pipeline health watchdog + dashboard fixes
// Usage: npx ts-node scripts/achiri/validate-sprint-141.ts

import { readFileSync, existsSync } from 'fs';
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

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Sprint 141 Validation — Pipeline watchdog + dashboard fixes');
console.log('══════════════════════════════════════════════════════════\n');

// ── Task 141-01: scripts/pipeline-watchdog.ts ─────────────────────────────────
const watchdogPath = resolve('scripts/pipeline-watchdog.ts');
check(
  '141-01a: scripts/pipeline-watchdog.ts exists',
  existsSync(watchdogPath)
);

const watchdog = existsSync(watchdogPath) ? readFileSync(watchdogPath, 'utf-8') : '';
check(
  '141-01b: pipeline-watchdog.ts defines STALE_THRESHOLD_HOURS',
  watchdog.includes('STALE_THRESHOLD_HOURS')
);

check(
  '141-01c: pipeline-watchdog.ts reads publish-ledger.jsonl',
  watchdog.includes('publish-ledger.jsonl')
);

check(
  '141-01d: pipeline-watchdog.ts sends Telegram alert when stale',
  watchdog.includes('sendTelegram') && watchdog.includes('Pipeline Stale')
);

check(
  '141-01e: pipeline-watchdog.ts supports WATCHDOG_DRY_RUN',
  watchdog.includes('WATCHDOG_DRY_RUN') || watchdog.includes('DRY_RUN')
);

// ── Task 141-02: ecosystem.config.js watchdog PM2 entry ───────────────────────
const ecosystem = readFileSync(resolve('ecosystem.config.js'), 'utf-8');
check(
  '141-02a: ecosystem.config.js has kognai-pipeline-watchdog entry',
  ecosystem.includes('kognai-pipeline-watchdog')
);

check(
  "141-02b: kognai-pipeline-watchdog has cron_restart '*/30 * * * *'",
  ecosystem.includes("*/30 * * * *")
);

console.log(`\n  Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('\n  ✓ Sprint 141 PASS — all checks green\n');
  process.exit(0);
} else {
  console.log('\n  ✗ Sprint 141 FAIL — fix failures above\n');
  process.exit(1);
}
