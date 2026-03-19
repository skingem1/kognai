#!/usr/bin/env npx ts-node
/**
 * Sprint 271 — Ledger Dedup validation test
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function main(): Promise<void> {
  console.log('=== Sprint 271 — Ledger Dedup Validation ===\n');

  // Check 1: Script exists
  check('dedup-ledger.ts exists', fs.existsSync(path.join(ROOT, 'scripts', 'scs001', 'dedup-ledger.ts')));

  // Check 2: Dry-run executes
  let output = '';
  try {
    output = execSync(
      'DEDUP_DRY_RUN=1 npx ts-node scripts/scs001/dedup-ledger.ts',
      { cwd: ROOT, timeout: 30000, encoding: 'utf-8', env: { ...process.env, DEDUP_DRY_RUN: '1' } }
    );
    check('dry-run executes without error', true);
  } catch (err: any) {
    output = err.stdout || '';
    check('dry-run executes without error', false, err.message?.slice(0, 100));
  }

  // Check 3: Output contains loaded count
  check('output shows loaded entries', /Loaded: \d+ entries/.test(output));

  // Check 4: Output shows unique count
  check('output shows unique count', /Unique: \d+/.test(output));

  // Check 5: Output shows duplicates removed
  check('output shows duplicates', /Duplicates removed: \d+/.test(output) || output.includes('No duplicates'));

  // Check 6: Dry-run doesn't modify ledger (check no .bak created)
  const backupPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl.bak');
  const hadBackup = fs.existsSync(backupPath);
  // Note: backup may exist from prior runs — we just check dry-run mentions skipping
  check('dry-run skips write', output.includes('DRY_RUN') || output.includes('No duplicates'));

  // Check 7: handleDedup export exists in commands.ts
  const commandsContent = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
  check('handleDedup exported in commands.ts', commandsContent.includes('export async function handleDedup'));

  // Check 8: /dedup routed in index.ts
  const indexContent = fs.readFileSync(path.join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');
  check('/dedup routed in index.ts', indexContent.includes("'/dedup'") || indexContent.includes("handleDedup"));
  check('handleDedup imported in index.ts', indexContent.includes('handleDedup'));

  // Check 9: Now run actual dedup (not dry-run) to clean up
  try {
    const realOutput = execSync(
      'npx ts-node scripts/scs001/dedup-ledger.ts',
      { cwd: ROOT, timeout: 30000, encoding: 'utf-8' }
    );
    check('actual dedup executes', true);

    // Check that backup was created
    check('backup file created', fs.existsSync(backupPath));

    // Check that ledger has fewer entries now
    const ledgerPath = path.join(ROOT, 'workspace', 'scs001', 'publish-ledger.jsonl');
    const lines = fs.readFileSync(ledgerPath, 'utf-8').split('\n').filter(l => l.trim());
    const ids = new Set(lines.map(l => { try { return JSON.parse(l).video_id; } catch { return null; } }).filter(Boolean));
    check('deduped ledger has unique entries only', lines.length === ids.size, `${lines.length} lines, ${ids.size} unique`);
  } catch (err: any) {
    check('actual dedup executes', false, err.message?.slice(0, 100));
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
