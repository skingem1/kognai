#!/usr/bin/env ts-node
/**
 * validate-sprint-135.ts — Sprint 135: Achiri /start onboarding
 *
 * Checks:
 *  1. handleStart() function contains 'achiri' (case-insensitive)
 *  2. handleStart() contains '/achiri' command reference
 *  3. handleStart() contains Darija/Arabic text or 'Darija' mention
 *  4. handleStart() still references tierBadge (account info preserved)
 *  5. handleStart() references 'postsPerDay' (account info preserved)
 *  6. handleStart() contains 'Apr 25' or alpha mention
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    process.stdout.write(`  ✅ ${label}\n`);
    passed++;
  } else {
    process.stdout.write(`  ❌ ${label}${detail ? ` — ${detail}` : ''}\n`);
    failed++;
  }
}

process.stdout.write('\n=== Sprint 135 Validation: Achiri /start Onboarding ===\n\n');

// Read commands.ts
const commandsPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const src = fs.existsSync(commandsPath) ? fs.readFileSync(commandsPath, 'utf-8') : '';
check('agents/telegram-bot/commands.ts exists', src.length > 0);

// Extract handleStart function body
const startMatch = src.match(/export async function handleStart[\s\S]*?^}/m);
const startBody = startMatch ? startMatch[0] : '';
check('handleStart() function found', startBody.length > 0);

// Check 1: mentions achiri
check('handleStart() contains "achiri" (case-insensitive)', /achiri/i.test(startBody));

// Check 2: /achiri command reference
check('handleStart() contains "/achiri" command', startBody.includes('/achiri'));

// Check 3: Darija or Arabic text
const hasDarija = /[Dd]arija|Arabic|\u0645\u0631\u062d\u0628|\u0643\u064a\u0641|\u0639\u0631\u0628/.test(startBody);
check('handleStart() mentions Darija/Arabic or contains Arabic script', hasDarija);

// Check 4: tierBadge preserved
check('handleStart() still references tierBadge (account section preserved)', startBody.includes('tierBadge'));

// Check 5: postsPerDay preserved
check('handleStart() still references postsPerDay', startBody.includes('postsPerDay'));

// Check 6: Alpha date mention
check('handleStart() contains Apr 25 or alpha mention', /[Aa]pr.?25|[Aa]lpha/.test(startBody));

// Print the actual handleStart body for visual review
process.stdout.write('\n--- handleStart() preview ---\n');
// Extract the message array content
const msgMatch = startBody.match(/await sendMessage\(chatId,[\s\S]*?\)\.join/);
if (msgMatch) {
  process.stdout.write(msgMatch[0].slice(0, 600) + '\n');
} else {
  process.stdout.write(startBody.slice(0, 600) + '\n');
}
process.stdout.write('--- End preview ---\n');

// ── Summary ───────────────────────────────────────────────────────────────────

process.stdout.write(`\n${'─'.repeat(50)}\n`);
process.stdout.write(`Sprint 135: ${passed + failed} checks — ${passed} PASS / ${failed} FAIL\n`);

if (failed === 0) {
  process.stdout.write('✅ SPRINT 135 PASS — Achiri onboarding updated\n');
  process.exit(0);
} else {
  process.stdout.write('❌ SPRINT 135 FAIL\n');
  process.exit(1);
}
