#!/usr/bin/env ts-node
/**
 * validate-sprint-172.ts — Sprint 172 Gate: ScriptAgent §17 Compliance
 *
 * ScriptAgent is a deterministic transformer with zero LLM calls (Model: NONE).
 * §17 compliance is satisfied trivially: no direct API calls exist to replace.
 * 4/4 checks must pass.
 */

import * as fs   from 'fs';
import * as path from 'path';

const ROOT   = path.join(__dirname, '..', '..');
const TARGET = path.join(ROOT, 'agents', 'scs001-script', 'index.ts');

let passed = 0;
const total = 4;

function check(label: string, fn: () => boolean): void {
  try {
    if (fn()) { console.log(`✅ ${label}`); passed++; }
    else       { console.log(`❌ ${label}`); }
  } catch (e) {
    console.log(`❌ ${label} — threw: ${(e as Error).message}`);
  }
}

if (!fs.existsSync(TARGET)) {
  console.error('❌ FATAL: Target file not found: ' + TARGET);
  process.exit(1);
}

const src = fs.readFileSync(TARGET, 'utf-8');

// 1. No ANTHROPIC_API_URL
check('File does NOT contain ANTHROPIC_API_URL', () =>
  !src.includes('ANTHROPIC_API_URL'));

// 2. No ANTHROPIC_API_KEY
check('File does NOT contain ANTHROPIC_API_KEY', () =>
  !src.includes('ANTHROPIC_API_KEY'));

// 3. No direct API fetch/axios/SDK calls
check('No direct API calls (fetch/axios/Anthropic/OpenAI SDK)', () => {
  const violations = [
    "fetch('https://api.anthropic",
    'fetch("https://api.anthropic',
    "fetch('https://api.openai",
    'fetch("https://api.openai',
    'new Anthropic(',
    'new OpenAI(',
  ];
  return !violations.some(v => src.includes(v));
});

// 4. §17 EXEMPT annotation present (confirms audit was completed)
check('§17 Compliance: EXEMPT annotation present (zero LLM calls — no routeCall needed)', () =>
  src.includes('§17 Compliance: EXEMPT'));

console.log(`\n${passed}/${total} checks passed`);
if (passed === total) {
  console.log('✅ SPRINT 172 PASS — ScriptAgent §17 compliant (EXEMPT: zero LLM calls)\n');
}
process.exit(passed === total ? 0 : 1);
