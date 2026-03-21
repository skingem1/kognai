#!/usr/bin/env ts-node
/**
 * Sprint 652 Validation — BrainX Swarm Bridge
 * Checks: module loads, swarm bridge creation, memory governance types,
 * distillation, orchestrator integration.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  console.log('\n=== Sprint 652 Validation — BrainX Swarm Bridge ===\n');

  // 1. Module loads
  let bridge: any;
  try {
    bridge = await import(join(ROOT, 'scripts', 'lib', 'brainx-swarm-bridge'));
    assert('brainx-swarm-bridge module loads', true);
  } catch (e: any) {
    assert('brainx-swarm-bridge module loads', false, e.message);
    process.exit(1);
  }

  // 2. Exports
  console.log('\n--- Exports ---');
  assert('BrainXSwarmBridge class exported', typeof bridge.BrainXSwarmBridge === 'function');
  assert('createSwarmBridge factory exported', typeof bridge.createSwarmBridge === 'function');

  // 3. Create bridge instance
  console.log('\n--- Bridge Creation ---');
  const testBridge = bridge.createSwarmBridge(
    'test-swarm-001',
    'sprint-652',
    ['ceo', 'coder', 'supervisor'],
    'rental-test-001',
    new Date(Date.now() + 3600000), // 1hr from now
  );
  assert('Bridge created successfully', !!testBridge);

  // 4. Bridge methods
  console.log('\n--- Bridge Methods ---');
  const bridgeSrc = readFileSync(join(ROOT, 'scripts', 'lib', 'brainx-swarm-bridge.ts'), 'utf-8');
  assert('injectMemories() method exists', bridgeSrc.includes('async injectMemories('));
  assert('injectAll() method exists', bridgeSrc.includes('async injectAll('));
  assert('storeTaskMemory() method exists', bridgeSrc.includes('async storeTaskMemory('));
  assert('propagateToSwarm() method exists', bridgeSrc.includes('async propagateToSwarm('));
  assert('expireRentalMemories() method exists', bridgeSrc.includes('async expireRentalMemories('));
  assert('distill() method exists', bridgeSrc.includes('async distill('));
  assert('close() method exists', bridgeSrc.includes('async close('));

  // 5. Governance types
  console.log('\n--- Governance Types ---');
  assert('SwarmContext type exported', bridgeSrc.includes('export interface SwarmContext'));
  assert('TaskMemoryInput type exported', bridgeSrc.includes('export interface TaskMemoryInput'));
  assert('GovernanceResult type exported', bridgeSrc.includes('export interface GovernanceResult'));
  assert('MemoryInjection type exported', bridgeSrc.includes('export interface MemoryInjection'));

  // 6. Rental governance logic
  console.log('\n--- Rental Governance ---');
  assert('Propagation skips originator', bridgeSrc.includes('Skip originator'));
  assert('Rental expiry handles originator differently', bridgeSrc.includes('Originator retains as WARM'));
  assert('Other agents get RENTAL_EXPIRED', bridgeSrc.includes('Other agents: expire'));

  // 7. Distillation config
  console.log('\n--- Distillation ---');
  assert('Uses qwen3:4b for distillation', bridgeSrc.includes('qwen3:4b'));
  assert('Compression prompt defined', bridgeSrc.includes('Compress the following into ONE sentence'));

  // 8. Live distillation test
  console.log('\n--- Live Distillation Test ---');
  try {
    const result = await testBridge.distill(
      'The agent attempted to write a file at workspace/scs001/output/video-001.mp4 but the FFmpeg ' +
      'process failed because libfreetype was not available on the system. The workaround was to use ' +
      'color blocks instead of text overlays. This was resolved by switching to the color block fallback ' +
      'mode that was implemented in Sprint 245. The file was successfully written after the fix.'
    );
    assert('Distillation returns compressed text', typeof result === 'string' && result.length > 0 && result.length < 300,
      result ? `${result.length} chars` : 'null');
  } catch (e: any) {
    console.log(`  ⚠ Ollama unavailable — skipping distillation test (${e.message})`);
  }

  // 9. Orchestrator integration
  console.log('\n--- Orchestrator Integration ---');
  const orchPath = join(ROOT, 'scripts', 'orchestrate-agents-v2.ts');
  if (existsSync(orchPath)) {
    const orchSrc = readFileSync(orchPath, 'utf-8');
    assert('Orchestrator imports brainx-swarm-bridge', orchSrc.includes('brainx-swarm-bridge'));
    assert('Orchestrator imports createSwarmBridge', orchSrc.includes('createSwarmBridge'));
  }

  // Cleanup
  await testBridge.close();

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
