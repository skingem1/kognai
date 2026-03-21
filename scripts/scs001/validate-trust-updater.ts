#!/usr/bin/env npx ts-node
/**
 * validate-trust-updater.ts — Sprint 703
 * Validates dynamic trust score updater.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');
let pass = 0;
let fail = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ ${name}`); fail++; }
  } catch (err: any) { console.log(`  ❌ ${name} — ${err.message}`); fail++; }
}

console.log('\n=== Sprint 703 — Trust Score Updater Validation ===\n');

// Updater script exists
const updaterPath = path.join(ROOT, 'scripts', 'lib', 'trust-score-updater.ts');
test('updater script exists', () => fs.existsSync(updaterPath));
const src = fs.readFileSync(updaterPath, 'utf-8');

test('updater: exports updateTrustScore', () => src.includes('export function updateTrustScore'));
test('updater: exports applyDailyDecay', () => src.includes('export function applyDailyDecay'));
test('updater: approved accuracy +1', () => src.includes('accuracy + 1'));
test('updater: rejected accuracy -2', () => src.includes('accuracy - 2'));
test('updater: safety flag -3', () => src.includes('safety - 3'));
test('updater: clamp to 0-100', () => src.includes('clamp'));
test('updater: recomputes composite', () => src.includes('recomputeComposite'));
test('updater: non-fatal on failure', () => src.includes('Non-fatal'));
test('updater: 5% daily decay', () => src.includes('DECAY_RATE') && src.includes('0.05'));
test('updater: mean target 70', () => src.includes('MEAN') && src.includes('70'));

// Orchestrator wiring
const orchSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'orchestrate-agents-v2.ts'), 'utf-8');
test('orchestrator: imports updateTrustScore', () => orchSrc.includes("import { updateTrustScore }"));
test('orchestrator: calls updateTrustScore on approval', () => orchSrc.includes("updateTrustScore(task.agent, 'approved'"));
test('orchestrator: calls updateTrustScore on rejection', () => orchSrc.includes("updateTrustScore(task.agent, 'rejected'"));

// Trust scores file integrity
const trustPath = path.join(ROOT, 'acp', 'trust-scores.json');
test('trust-scores.json exists', () => fs.existsSync(trustPath));
const trustData = JSON.parse(fs.readFileSync(trustPath, 'utf-8'));
test('trust-scores: has dimensions with weights', () =>
  trustData.dimensions && Object.values(trustData.dimensions).every((d: any) => typeof d.weight === 'number'));
test('trust-scores: has agent scores', () =>
  trustData.scores && Object.keys(trustData.scores).length > 0);
test('trust-scores: agents have composite', () =>
  Object.values(trustData.scores).every((s: any) => typeof s.composite === 'number'));

// Surgical edit verification
const orchLines = orchSrc.split('\n').length;
test(`orchestrator size reasonable (${orchLines} lines)`, () => orchLines > 2800 && orchLines < 3500);

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
