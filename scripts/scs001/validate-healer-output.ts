/**
 * validate-healer-output.ts — Sprint 676
 * Validates pm2-auto-healer.ts structure and failure tracking.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const HEALER = join(ROOT, 'scripts', 'pm2-auto-healer.ts');
const FAILURE_LOG = join(ROOT, 'workspace', 'scs001', 'healer-failures.json');

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== PM2 Auto-Healer Validation ===\n');

// Test 1: Script exists
check('pm2-auto-healer.ts exists', existsSync(HEALER));

// Test 2: Script has key features
const src = existsSync(HEALER) ? readFileSync(HEALER, 'utf-8') : '';
check('Has FAILURE_THRESHOLD', src.includes('FAILURE_THRESHOLD'));
check('Has consecutive failure tracking', src.includes('consecutive'));
check('Has recordFailure function', src.includes('recordFailure'));
check('Has clearFailure function', src.includes('clearFailure'));
check('Has recordRestart function', src.includes('recordRestart'));
check('Has healer-failures.json path', src.includes('healer-failures.json'));
check('Has Telegram alert', src.includes('sendTelegram'));
check('Has tracking status in alerts', src.includes('Tracking'));
check('Default threshold is 3', src.includes("'3'"));

// Test 3: Failure log can be written and read
const testLog = { 'test-process': { consecutive: 2, last_seen: new Date().toISOString(), total_restarts: 0 } };
try {
  writeFileSync(FAILURE_LOG, JSON.stringify(testLog, null, 2), 'utf-8');
  const read = JSON.parse(readFileSync(FAILURE_LOG, 'utf-8'));
  check('Failure log write/read works', read['test-process']?.consecutive === 2);
  unlinkSync(FAILURE_LOG);
  check('Failure log cleanup works', !existsSync(FAILURE_LOG));
} catch (e: any) {
  check('Failure log write/read works', false, e.message);
  check('Failure log cleanup works', false);
}

// Test 4: Essential processes lists exist
check('Has ESSENTIAL_CRONS list', src.includes('ESSENTIAL_CRONS'));
check('Has ESSENTIAL_DAEMONS list', src.includes('ESSENTIAL_DAEMONS'));
check('Has telegram-bot in daemons', src.includes("'telegram-bot'"));

console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? '\nPASS' : '\nFAIL');
process.exit(fail === 0 ? 0 : 1);
