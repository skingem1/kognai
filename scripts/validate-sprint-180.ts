#!/usr/bin/env ts-node
// OMEL Phase 1 Gate Validator — Sprint 180 (AMD-13)
// Verifies all 5 OMEL Phase 1 components are importable and their singletons non-null.
// Writes gate report to workspace/gates/omel-phase1-gate.json
// Exit 0 on PASS, exit 1 on FAIL. Keep file <150 lines.

import * as fs   from 'fs';
import * as path from 'path';

const ROOT      = path.join(__dirname, '..');
const GATES_DIR = path.join(ROOT, 'workspace', 'gates');
const LOGS_OMEL = path.join(ROOT, 'logs', 'omel');

fs.mkdirSync(GATES_DIR, { recursive: true });

// ── Check helpers ─────────────────────────────────────────────────────────────

interface Check {
  name:    string;
  passed:  boolean;
  detail?: string;
}

const checks: Check[] = [];

function addCheck(name: string, passed: boolean, detail?: string): void {
  checks.push({ name, passed, ...(detail !== undefined ? { detail } : {}) });
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── Gate report writer ────────────────────────────────────────────────────────

function writeReport(overrideStatus?: 'PASS' | 'FAIL'): void {
  const allPassed = checks.every(c => c.passed);
  const status    = overrideStatus ?? (allPassed ? 'PASS' : 'FAIL');
  const report = {
    status,
    sprint: 'sprint-180',
    ts:     new Date().toISOString(),
    checks,
  };
  fs.writeFileSync(
    path.join(GATES_DIR, 'omel-phase1-gate.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(`\n📋 Gate report → workspace/gates/omel-phase1-gate.json`);
}

// ── 1. Import all 5 OMEL singletons from barrel index ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
let omel: Record<string, any>;
try {
  omel = require('./lib/omel/index');
  addCheck('OMEL index importable (scripts/lib/omel/index.ts)', true);
} catch (e: any) {
  addCheck('OMEL index importable (scripts/lib/omel/index.ts)', false, e.message);
  writeReport('FAIL');
  process.exit(1);
}

// ── 2. Verify each singleton is a non-null object ────────────────────────────

function checkSingleton(key: string): void {
  const val = omel[key];
  const ok  = val !== null && val !== undefined && typeof val === 'object';
  addCheck(`${key} singleton non-null`, ok, ok ? undefined : `got ${JSON.stringify(val)}`);
}

checkSingleton('phantomWorkspace');
checkSingleton('credentialVault');
checkSingleton('wipeWitness');
checkSingleton('humanBrake');
checkSingleton('contaminationGuard');

// ── 3. OMEL log directory exists ─────────────────────────────────────────────

const logsExist = fs.existsSync(LOGS_OMEL);
addCheck('logs/omel/ directory exists', logsExist, logsExist ? LOGS_OMEL : 'not found');

// ── 4. Write report and exit ─────────────────────────────────────────────────

writeReport();

const allPassed = checks.every(c => c.passed);
console.log(`\n${allPassed ? '🟢' : '🔴'} OMEL Phase 1 Gate: ${allPassed ? 'PASS' : 'FAIL'}`);
console.log(`   ${checks.filter(c => c.passed).length}/${checks.length} checks passed`);

process.exit(allPassed ? 0 : 1);
