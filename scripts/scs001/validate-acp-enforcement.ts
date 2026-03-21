#!/usr/bin/env npx ts-node
/**
 * validate-acp-enforcement.ts — Sprint 702
 * Validates ACPEngine enforcement is wired into CTO approval gate.
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

console.log('\n=== Sprint 702 — ACP Enforcement Validation ===\n');

// CTO Gate checks
const ctsSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'cto-approval-gate.ts'), 'utf-8');
test('CTO gate: imports ACPEngine', () => ctsSrc.includes("import { ACPEngine"));
test('CTO gate: imports EnforcementResult', () => ctsSrc.includes('EnforcementResult'));
test('CTO gate: instantiates ACPEngine', () => ctsSrc.includes('new ACPEngine()'));
test('CTO gate: calls enforce()', () => ctsSrc.includes('acpEngine.enforce('));
test('CTO gate: handles block recommendation', () => ctsSrc.includes("'block'"));
test('CTO gate: handles recycle recommendation', () => ctsSrc.includes("'recycle'"));
test('CTO gate: handles fallback recommendation', () => ctsSrc.includes("'fallback'"));
test('CTO gate: logs ACPEngine rejection', () => ctsSrc.includes('ACP_TRUST_VIOLATION'));
test('CTO gate: non-fatal on ACPEngine failure', () => ctsSrc.includes('non-fatal'));
test('CTO gate: enforcement before LLM review', () => {
  const acpIdx = ctsSrc.indexOf('acpEngine.enforce');
  const llmIdx = ctsSrc.indexOf('routeCall(');
  return acpIdx > 0 && llmIdx > 0 && acpIdx < llmIdx;
});

// ACPEngine exists and is functional
const acpPath = path.join(ROOT, 'acp', 'acp-engine.ts');
test('ACPEngine file exists', () => fs.existsSync(acpPath));
const acpSrc = fs.readFileSync(acpPath, 'utf-8');
test('ACPEngine: enforce method exists', () => acpSrc.includes('enforce(agentId'));
test('ACPEngine: returns EnforcementResult', () => acpSrc.includes('EnforcementResult'));

// Trust scores exist
test('trust-scores.json exists', () => fs.existsSync(path.join(ROOT, 'acp', 'trust-scores.json')));

// Existing ACP capability check still present
test('CTO gate: original checkCapability still present', () => ctsSrc.includes('checkCapability('));

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
