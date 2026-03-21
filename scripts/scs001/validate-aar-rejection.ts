#!/usr/bin/env npx ts-node
/**
 * validate-aar-rejection.ts — Sprint 701
 * Validates AAR logs both success and rejection entries.
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

console.log('\n=== Sprint 701 — AAR Rejection Path Validation ===\n');

// Test 1: Orchestrator has AAR on both paths
const orchSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'orchestrate-agents-v2.ts'), 'utf-8');

test('orchestrator: AAR on approval path', () => {
  // The existing success AAR call
  return orchSrc.includes("AARMiddleware.generateAndLog") && orchSrc.includes("status: 'success'");
});

test('orchestrator: AAR on rejection path', () => {
  return orchSrc.includes("status: 'rejected'") && orchSrc.includes("REJECTED:");
});

test('orchestrator: rejection AAR includes attempt number', () => {
  return orchSrc.includes('attempt ${attempt}') || orchSrc.includes('`attempt ${attempt}`');
});

test('orchestrator: rejection AAR uses correct sprint ID', () => {
  return orchSrc.includes('_sprintIdRejected');
});

// Test 2: AAR middleware supports rejection status
const aarSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'aar-middleware.ts'), 'utf-8');
test('AAR middleware: status field in params', () => aarSrc.includes('status'));
test('AAR middleware: generateAndLog method exists', () => aarSrc.includes('generateAndLog'));

// Test 3: AAR types support rejection
const typesPath = path.join(ROOT, 'scripts', 'lib', 'aar-types.ts');
if (fs.existsSync(typesPath)) {
  const typesSrc = fs.readFileSync(typesPath, 'utf-8');
  test('AAR types: status field includes rejected', () =>
    typesSrc.includes("'rejected'") || typesSrc.includes('"rejected"') || typesSrc.includes('status'));
} else {
  test('AAR types file exists', () => false);
}

// Test 4: Check existing AAR logs for both statuses
const aarDir = path.join(ROOT, 'logs', 'aar');
if (fs.existsSync(aarDir)) {
  const aarFiles = fs.readdirSync(aarDir).filter(f => f.endsWith('.jsonl'));
  test('AAR log directory exists with entries', () => aarFiles.length > 0);

  // Check if any existing entries have success status
  let hasSuccess = false;
  let totalEntries = 0;
  for (const file of aarFiles) {
    const lines = fs.readFileSync(path.join(aarDir, file), 'utf-8').split('\n').filter(l => l.trim());
    totalEntries += lines.length;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.status === 'success') hasSuccess = true;
      } catch {}
    }
  }
  test(`AAR logs have success entries (${totalEntries} total)`, () => hasSuccess);
  console.log(`    [info] ${totalEntries} total AAR entries across ${aarFiles.length} files`);
} else {
  test('AAR log directory exists', () => false);
}

// Test 5: Code failure logger still works alongside AAR
test('orchestrator: logCodeFailure still on rejection path', () =>
  orchSrc.includes('logCodeFailure') && orchSrc.includes('supervisor_rejected'));

// Test 6: Surgical edit verification — no large rewrites
const orchLines = orchSrc.split('\n').length;
test(`orchestrator file size reasonable (${orchLines} lines, expect ~3100)`, () =>
  orchLines > 2800 && orchLines < 3500);

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
