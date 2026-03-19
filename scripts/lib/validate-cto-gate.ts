#!/usr/bin/env ts-node
// Sprint 257 — AMD-14 CTO Gate Validation

import { evaluateSprint, analyzeComplexity, selectTier, printDecision } from './cto-gate';
import type { SprintSpec } from './cto-gate';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

function main(): void {
  console.log('');
  console.log('🎯  Sprint 257 — AMD-14 CTO Gate Validation');
  console.log('');

  // --- Test 1: Simple sprint → T1 or T2 LOCAL ---
  console.log('Test 1: Simple sprint');
  const simpleSprint: SprintSpec = {
    sprint_id: 'sprint-test-simple',
    title: 'Fix typo in config file',
    description: 'Update a typo in the env config',
    tasks: [
      { id: 'T1', title: 'Fix typo in .env.example', type: 'bugfix' },
    ],
  };
  const simpleResult = evaluateSprint(simpleSprint);
  assert(simpleResult.complexity.score <= 3, 'Simple score <= 3: ' + simpleResult.complexity.score);
  assert(simpleResult.tier === 'T1_LOCAL' || simpleResult.tier === 'T2_POWER',
    'Simple tier is LOCAL or POWER: ' + simpleResult.tier);
  assert(simpleResult.cost_per_1k === 0, 'Simple cost is $0');
  printDecision(simpleResult);

  // --- Test 2: Medium sprint → T2 POWER ---
  console.log('\nTest 2: Medium sprint');
  const mediumSprint: SprintSpec = {
    sprint_id: 'sprint-test-medium',
    title: 'Dashboard Achiri panel + validation',
    description: 'Create dashboard panel for Achiri alpha deploy. Module with test.',
    tasks: [
      { id: 'T1', title: 'Create dashboard panel module', type: 'feature' },
      { id: 'T2', title: 'Add invite DM notification handler', type: 'feature' },
      { id: 'T3', title: 'Validate dashboard output', type: 'test' },
    ],
  };
  const mediumResult = evaluateSprint(mediumSprint);
  assert(mediumResult.complexity.score >= 3 && mediumResult.complexity.score <= 6,
    'Medium score 3-6: ' + mediumResult.complexity.score);
  assert(mediumResult.tier === 'T2_POWER', 'Medium tier is POWER: ' + mediumResult.tier);
  printDecision(mediumResult);

  // --- Test 3: Complex sprint → T2 or T3 ---
  console.log('\nTest 3: Complex sprint');
  const complexSprint: SprintSpec = {
    sprint_id: 'sprint-test-complex',
    title: 'Blotato Multi-Platform Publishing — 9 platforms via API',
    description: 'Replace TikTok API with Blotato REST API integration. Multi-platform publishing pipeline with orchestration.',
    tasks: [
      { id: 'T1', title: 'Create Blotato API client module', type: 'feature', agent: 'coder' },
      { id: 'T2', title: 'Refactor PublishingAgent for multi-platform', type: 'feature', agent: 'coder' },
      { id: 'T3', title: 'Update orchestrator pipeline integration', type: 'feature', agent: 'supervisor' },
      { id: 'T4', title: 'Create E2E pipeline test', type: 'test', agent: 'coder' },
      { id: 'T5', title: 'Deploy and validate live API endpoint', type: 'feature', agent: 'coder' },
    ],
  };
  const complexResult = evaluateSprint(complexSprint);
  assert(complexResult.complexity.score >= 5, 'Complex score >= 5: ' + complexResult.complexity.score);
  assert(complexResult.complexity.has_api_integration, 'Detected API integration');
  assert(complexResult.complexity.has_multi_agent, 'Detected multi-agent');
  printDecision(complexResult);

  // --- Test 4: Force tier override ---
  console.log('\nTest 4: Force tier override');
  const overrideResult = evaluateSprint(simpleSprint, { forceTier: 'T3_CLOUD' });
  assert(overrideResult.tier === 'T3_CLOUD', 'Override to T3_CLOUD: ' + overrideResult.tier);
  assert(overrideResult.overrides.length > 0, 'Override noted');
  assert(overrideResult.cost_per_1k > 0, 'Cloud cost > $0');
  printDecision(overrideResult);

  // --- Test 5: Complexity analysis details ---
  console.log('\nTest 5: Complexity analysis');
  const analysis = analyzeComplexity(complexSprint);
  assert(analysis.task_count === 5, 'Task count: ' + analysis.task_count);
  assert(analysis.factors.length >= 2, 'Has factors: ' + analysis.factors.length);
  assert(analysis.score >= 1 && analysis.score <= 10, 'Score in range: ' + analysis.score);

  // --- Test 6: Tier selection boundaries ---
  console.log('\nTest 6: Tier selection boundaries');
  const tier1 = selectTier({ score: 1, factors: [], task_count: 1, unique_files: 1, has_api_integration: false, has_external_deps: false, has_multi_agent: false, has_evaluation: false });
  const tier2 = selectTier({ score: 5, factors: [], task_count: 3, unique_files: 3, has_api_integration: false, has_external_deps: false, has_multi_agent: false, has_evaluation: false });
  const tier3 = selectTier({ score: 8, factors: [], task_count: 6, unique_files: 6, has_api_integration: true, has_external_deps: true, has_multi_agent: true, has_evaluation: false });
  const tier4 = selectTier({ score: 10, factors: [], task_count: 8, unique_files: 8, has_api_integration: true, has_external_deps: true, has_multi_agent: true, has_evaluation: true });
  assert(tier1 === 'T1_LOCAL', 'Score 1 → T1_LOCAL: ' + tier1);
  assert(tier2 === 'T2_POWER', 'Score 5 → T2_POWER: ' + tier2);
  assert(tier3 === 'T3_CLOUD', 'Score 8 → T3_CLOUD: ' + tier3);
  assert(tier4 === 'T4_APEX', 'Score 10 → T4_APEX: ' + tier4);

  // --- Test 7: Decision structure ---
  console.log('\nTest 7: Decision structure');
  assert(!!simpleResult.sprint_id, 'Has sprint_id');
  assert(!!simpleResult.model_name, 'Has model_name: ' + simpleResult.model_name);
  assert(!!simpleResult.reasoning, 'Has reasoning');
  assert(simpleResult.cost_per_1k >= 0, 'Cost >= 0');

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 257 — AMD-14 CTO Gate — ALL PASS');
  } else {
    console.log('❌ Sprint 257 — ' + failed + ' tests FAILED');
  }
}

main();
