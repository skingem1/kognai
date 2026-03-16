#!/usr/bin/env ts-node
/**
 * validate-sprint-134.ts — Sprint 134: Daily pipeline digest
 *
 * Checks:
 *  1. scripts/daily-digest.ts exists and is non-empty
 *  2. ecosystem.config.js contains 'kognai-daily-digest' with cron_restart '0 7 * * *'
 *  3. Dry-run (DIGEST_DRY_RUN=1) prints a digest message to stdout
 *  4. Dry-run output contains gate section (posts/views/days keywords)
 *  5. No external npm require statements in daily-digest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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

process.stdout.write('\n=== Sprint 134 Validation: Daily Pipeline Digest ===\n\n');

// ── Check 1: File exists ───────────────────────────────────────────────────────

const digestPath = path.join(ROOT, 'scripts', 'daily-digest.ts');
const digestExists = fs.existsSync(digestPath);
check('scripts/daily-digest.ts exists', digestExists);

let digestSource = '';
if (digestExists) {
  digestSource = fs.readFileSync(digestPath, 'utf-8');
  check('daily-digest.ts is non-empty (>100 chars)', digestSource.length > 100);
}

// ── Check 2: No external npm deps ─────────────────────────────────────────────

if (digestSource) {
  // Allow only built-in node modules: fs, path, https, http, os, child_process
  const requireMatches = [...digestSource.matchAll(/require\(['"]([^'"]+)['"]\)/g)];
  const importMatches  = [...digestSource.matchAll(/from ['"]([^'"./][^'"]*)['"]/g)];
  const allModules = [
    ...requireMatches.map(m => m[1]),
    ...importMatches.map(m => m[1]),
  ];
  const allowedBuiltins = new Set(['fs', 'path', 'https', 'http', 'os', 'child_process', 'util', 'stream']);
  const external = allModules.filter(m => !allowedBuiltins.has(m));
  check(
    'No external npm deps (stdlib only)',
    external.length === 0,
    external.length > 0 ? `found: ${external.join(', ')}` : undefined
  );
}

// ── Check 3: ecosystem.config.js has kognai-daily-digest ──────────────────────

const ecoPath = path.join(ROOT, 'ecosystem.config.js');
const ecoSource = fs.existsSync(ecoPath) ? fs.readFileSync(ecoPath, 'utf-8') : '';
check('ecosystem.config.js has kognai-daily-digest entry', ecoSource.includes('kognai-daily-digest'));
check("ecosystem.config.js cron_restart is '0 7 * * *'", ecoSource.includes('"0 7 * * *"') || ecoSource.includes("'0 7 * * *'"));

// ── Check 4: Dry-run prints a digest ─────────────────────────────────────────

let dryRunOutput = '';
let dryRunError = '';
try {
  dryRunOutput = execSync(
    'npx ts-node scripts/daily-digest.ts',
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DIGEST_DRY_RUN: '1',
        TS_NODE_TRANSPILE_ONLY: 'true',
      },
      timeout: 20000,
      stdio: 'pipe',
    }
  ).toString();
} catch (e: any) {
  dryRunError = e.message;
  dryRunOutput = e.stdout?.toString() ?? '';
}

const dryRunSuccess = dryRunOutput.includes('DIGEST DRY RUN');
check('Dry-run (DIGEST_DRY_RUN=1) runs without error', dryRunSuccess, dryRunError || undefined);

// ── Check 5: Digest content validation ───────────────────────────────────────

if (dryRunSuccess) {
  check('Digest contains posts count (*/30)', /\d+\/30/.test(dryRunOutput));
  check('Digest contains views count (*/500)', /\d+\/500/.test(dryRunOutput));
  check('Digest contains gate date mention (Apr 7)', dryRunOutput.includes('Apr 7'));
  check('Digest contains "Phase 1.5 Gate" section', dryRunOutput.includes('Phase 1.5 Gate'));
  check('Digest contains "Pipeline" section', dryRunOutput.includes('Pipeline'));
  check('Digest contains "Upcoming gates" section', dryRunOutput.includes('Upcoming gates'));

  // Print the digest for visual review
  process.stdout.write('\n--- Digest Preview ---\n');
  const digestLines = dryRunOutput
    .replace('=== DIGEST DRY RUN ===\n', '')
    .replace('\n=== END ===\n', '');
  process.stdout.write(digestLines + '\n');
  process.stdout.write('--- End Preview ---\n');
} else {
  process.stdout.write(`\nDry-run output:\n${dryRunOutput}\nError: ${dryRunError}\n`);
}

// ── Summary ───────────────────────────────────────────────────────────────────

process.stdout.write(`\n${'─'.repeat(50)}\n`);
process.stdout.write(`Sprint 134: ${passed + failed} checks — ${passed} PASS / ${failed} FAIL\n`);

if (failed === 0) {
  process.stdout.write('✅ SPRINT 134 PASS — Daily digest ready\n');
  process.exit(0);
} else {
  process.stdout.write('❌ SPRINT 134 FAIL\n');
  process.exit(1);
}
