// Sprint 336 — validate-broadcast.ts
// Validates the /broadcast command integration.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== Sprint 336 — Broadcast Validation ===\n');

// Test 1: Command exists
console.log('Test 1: Bot command');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = readFileSync(cmdPath, 'utf-8');
assert('handleBroadcast exported', cmdSrc.includes('export async function handleBroadcast'));
assert('Reads alpha-whitelist.jsonl', cmdSrc.includes('alpha-whitelist.jsonl'));
assert('Reads waitlist.jsonl', cmdSrc.includes('waitlist.jsonl'));
assert('Logs to broadcast-log.jsonl', cmdSrc.includes('broadcast-log.jsonl'));
assert('Rate limit delay', cmdSrc.includes('setTimeout'));
assert('Owner-only guard', cmdSrc.includes("String(chatId) !== ownerChatId"));
assert('Empty message help', cmdSrc.includes('Usage:'));
assert('Counts sent/failed', cmdSrc.includes('sent++') && cmdSrc.includes('failed++'));

// Test 2: Routing
console.log('\nTest 2: Bot routing');
const idxPath = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const idxSrc = readFileSync(idxPath, 'utf-8');
assert('Imports handleBroadcast', idxSrc.includes('handleBroadcast'));
assert('Routes /broadcast case', idxSrc.includes("case '/broadcast'"));

// Test 3: TypeScript compile
console.log('\nTest 3: TypeScript compilation');
try {
  const { execSync } = require('child_process');
  execSync(`npx tsc --noEmit --esModuleInterop --skipLibCheck ${cmdPath} 2>&1`, {
    cwd: ROOT,
    timeout: 30000,
  });
  assert('commands.ts compiles', true);
} catch (err) {
  const msg = (err as any).stdout?.toString() ?? (err as Error).message;
  assert('commands.ts compiles', false, msg.slice(0, 200));
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
