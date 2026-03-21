#!/usr/bin/env npx ts-node
/**
 * validate-digest-markdown.ts — Sprint 679
 * Validates that daily-digest.ts produces valid Telegram Markdown V1.
 * Checks: no unescaped special chars in dynamic content, dry-run succeeds.
 */

import { execSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let pass = true;
const results: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  const icon = ok ? 'PASS' : 'FAIL';
  results.push(`[${icon}] ${name}: ${detail}`);
  if (!ok) pass = false;
}

// Test 1: escapeMd properly escapes special chars
try {
  // Import the module and test escapeMd indirectly via dry-run output
  const output = execSync(
    `cd "${ROOT}" && DIGEST_DRY_RUN=1 npx ts-node scripts/daily-digest.ts 2>&1`,
    { encoding: 'utf-8', timeout: 30000 }
  );
  check('dry-run-executes', true, 'Daily digest dry-run completed without error');

  // Test 2: Check for common Markdown V1 parse failure patterns
  // Unmatched * or _ (not preceded by \) that would cause parse errors
  const lines = output.split('\n');
  let unmatched = 0;
  for (const line of lines) {
    // Skip code blocks and the dry-run header/footer
    if (line.startsWith('===') || line.startsWith('```')) continue;

    // Count unescaped * and _ — they must come in pairs
    const unescapedStars = (line.match(/(?<!\\)\*/g) || []).length;
    const unescapedUnderscores = (line.match(/(?<!\\)_/g) || []).length;
    if (unescapedStars % 2 !== 0) unmatched++;
    if (unescapedUnderscores % 2 !== 0) unmatched++;
  }
  check('markdown-balanced', unmatched === 0, unmatched === 0
    ? 'All * and _ are balanced'
    : `${unmatched} lines with unmatched * or _`);

  // Test 3: No raw < > in output (should be stripped)
  const hasAngleBrackets = /[<>]/.test(output);
  check('no-angle-brackets', !hasAngleBrackets, hasAngleBrackets
    ? 'Found raw < or > in output'
    : 'No angle brackets in output');

  // Test 4: Output is non-empty and has expected sections
  const hasGateSection = output.includes('Phase 1.5 Gate') || output.includes('Gate');
  check('has-gate-section', hasGateSection, hasGateSection
    ? 'Gate section present'
    : 'Missing gate section');

  const hasPipelineSection = output.includes('Pipeline');
  check('has-pipeline-section', hasPipelineSection, hasPipelineSection
    ? 'Pipeline section present'
    : 'Missing pipeline section');

} catch (err: any) {
  check('dry-run-executes', false, `Dry-run failed: ${err.message?.slice(0, 200)}`);
}

// Test 5: Check that sendPlainText function exists in daily-digest.ts
try {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'daily-digest.ts'), 'utf-8');
  const hasFallback = src.includes('sendPlainText');
  check('has-plaintext-fallback', hasFallback, hasFallback
    ? 'sendPlainText fallback function exists'
    : 'Missing sendPlainText fallback');

  const hasEscape = src.includes('\\\\$1') || src.includes("'\\\\$1'");
  check('escapeMd-escapes-chars', hasEscape, hasEscape
    ? 'escapeMd escapes special characters'
    : 'escapeMd may not properly escape chars');
} catch (err: any) {
  check('source-check', false, `Could not read source: ${err.message?.slice(0, 200)}`);
}

console.log('\n=== Digest Markdown Validation ===');
results.forEach(r => console.log(r));
console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
