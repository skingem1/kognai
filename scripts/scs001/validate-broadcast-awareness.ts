#!/usr/bin/env npx ts-node
/**
 * validate-broadcast-awareness.ts — Sprint 692
 * Validates AMD-17 broadcast awareness flag in AGENTS.md and SOUL.md.
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

console.log('\n=== Sprint 692 — Broadcast Awareness Validation ===\n');

// AGENTS.md checks
const agentsMd = fs.readFileSync(path.join(ROOT, 'workspace', 'AGENTS.md'), 'utf-8');
test('AGENTS.md: BROADCAST_AWARE=true flag', () => agentsMd.includes('BROADCAST_AWARE=true'));
test('AGENTS.md: AMD-17 section header', () => agentsMd.includes('Broadcast Awareness (AMD-17)'));
test('AGENTS.md: ACP filter rule', () => agentsMd.includes('ACP filter') || agentsMd.includes('ACP (Agent Capability Protocol) filter'));
test('AGENTS.md: 60-second buffer rule', () => agentsMd.includes('60-second'));
test('AGENTS.md: internal ≠ external principle', () => agentsMd.includes('Internal') && agentsMd.includes('External'));
test('AGENTS.md: Godman kill switch', () => agentsMd.includes('kill switch'));
test('AGENTS.md: broadcast tag format', () => agentsMd.includes('broadcast: true'));
test('AGENTS.md: no-broadcast rule in prohibited actions', () => agentsMd.includes('broadcast surface') && agentsMd.includes('Not Allowed'));

// SOUL.md checks
const soulMd = fs.readFileSync(path.join(ROOT, 'workspace', 'SOUL.md'), 'utf-8');
test('SOUL.md: BROADCAST_AWARE=true flag', () => soulMd.includes('BROADCAST_AWARE=true'));
test('SOUL.md: AMD-17 section', () => soulMd.includes('Broadcast Awareness (AMD-17)'));
test('SOUL.md: ACP filter mention', () => soulMd.includes('ACP filter'));
test('SOUL.md: 60-second delay mention', () => soulMd.includes('60-second'));
test('SOUL.md: kill switch mention', () => soulMd.includes('kill switch'));
test('SOUL.md: narrator agent mention', () => soulMd.includes('narrator agent'));

// Structural checks
test('AGENTS.md: broadcast section before prohibited section', () => {
  const broadcastIdx = agentsMd.indexOf('Broadcast Awareness');
  const prohibitedIdx = agentsMd.indexOf('What Agents Are Not Allowed');
  return broadcastIdx > 0 && prohibitedIdx > 0 && broadcastIdx < prohibitedIdx;
});

test('SOUL.md: broadcast section before constitution reference', () => {
  const broadcastIdx = soulMd.indexOf('Broadcast Awareness');
  const constitutionIdx = soulMd.indexOf('Constitution Reference');
  return broadcastIdx > 0 && constitutionIdx > 0 && broadcastIdx < constitutionIdx;
});

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) { console.log('\n❌ FAIL'); process.exit(1); }
else { console.log('\n✅ ALL PASS'); }
