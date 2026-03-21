#!/usr/bin/env ts-node
/**
 * Sprint 650 Validation — Agent Capability Protocol (ACP)
 * Checks: module loads, all agents registered, capability checks work,
 * CTO gate integration.
 */

import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

async function main() {
  console.log('\n=== Sprint 650 Validation — Agent Capability Protocol ===\n');

  // 1. Module loads
  let acp: any;
  try {
    acp = await import(join(ROOT, 'agents', 'lib', 'acp'));
    assert('ACP module loads', true);
  } catch (e: any) {
    assert('ACP module loads', false, e.message);
    process.exit(1);
  }

  // 2. Key exports
  assert('getAllAgents exported', typeof acp.getAllAgents === 'function');
  assert('getAgent exported', typeof acp.getAgent === 'function');
  assert('checkCapability exported', typeof acp.checkCapability === 'function');
  assert('checkCapabilities exported', typeof acp.checkCapabilities === 'function');
  assert('getAgentsWithCapability exported', typeof acp.getAgentsWithCapability === 'function');
  assert('validateSprintAssignments exported', typeof acp.validateSprintAssignments === 'function');
  assert('getRegistryStats exported', typeof acp.getRegistryStats === 'function');

  // 3. Registry stats
  const stats = acp.getRegistryStats();
  console.log(`\n--- Registry: ${stats.total_agents} agents (${stats.kognai_agents} kognai, ${stats.scs001_agents} SCS-001) ---`);
  assert('Total agents >= 40', stats.total_agents >= 40, `got ${stats.total_agents}`);
  assert('Kognai agents >= 25', stats.kognai_agents >= 25, `got ${stats.kognai_agents}`);
  assert('SCS-001 agents >= 13', stats.scs001_agents >= 13, `got ${stats.scs001_agents}`);
  console.log(`  Tiers: T1=${stats.by_tier.T1}, T2=${stats.by_tier.T2}, T3=${stats.by_tier.T3}, T4=${stats.by_tier.T4}`);

  // 4. Key agent lookups
  console.log('\n--- Agent Lookups ---');
  assert('CEO agent exists', !!acp.getAgent('ceo'));
  assert('CTO agent exists', !!acp.getAgent('cto'));
  assert('Supervisor agent exists', !!acp.getAgent('supervisor'));
  assert('SCS-001 Orchestrator exists', !!acp.getAgent('scs001-orchestrator'));
  assert('SCS-001 Script exists', !!acp.getAgent('scs001-script'));

  // 5. Capability checks — positive
  console.log('\n--- Capability Checks (Positive) ---');
  const ceoReadCheck = acp.checkCapability('ceo', 'read_files');
  assert('CEO can read_files', ceoReadCheck.allowed);

  const scriptLlm = acp.checkCapability('scs001-script', 'llm_call_local');
  assert('SCS-001 Script can llm_call_local', scriptLlm.allowed);

  const devopsDeploy = acp.checkCapability('devops', 'deploy');
  assert('DevOps can deploy', devopsDeploy.allowed);

  // 6. Capability checks — negative (denied)
  console.log('\n--- Capability Checks (Denied) ---');
  const ceoDenied = acp.checkCapability('ceo', 'stripe_write');
  assert('CEO cannot stripe_write', !ceoDenied.allowed);

  const supervisorDenied = acp.checkCapability('supervisor', 'shell_exec');
  assert('Supervisor cannot shell_exec', !supervisorDenied.allowed);

  const cfoDenied = acp.checkCapability('cfo', 'write_files');
  assert('CFO cannot write_files', !cfoDenied.allowed);

  // 7. Unknown agent check
  const unknownCheck = acp.checkCapability('nonexistent-agent', 'read_files');
  assert('Unknown agent returns not allowed', !unknownCheck.allowed);

  // 8. Sprint assignment validation
  console.log('\n--- Sprint Assignment Validation ---');
  const validAssignment = acp.validateSprintAssignments([
    { agent: 'scs001-script', required_capabilities: ['read_files', 'llm_call_local', 'script_generate'] },
    { agent: 'scs001-editing', required_capabilities: ['video_composite', 'tts_generate'] },
  ]);
  assert('Valid sprint assignment passes', validAssignment.valid);

  const invalidAssignment = acp.validateSprintAssignments([
    { agent: 'cfo', required_capabilities: ['deploy', 'shell_exec'] },
  ]);
  assert('Invalid sprint assignment fails', !invalidAssignment.valid);
  assert('Violations detected correctly', invalidAssignment.violations.length >= 2,
    `got ${invalidAssignment.violations.length} violations`);

  // 9. CTO gate integration
  console.log('\n--- CTO Gate Integration ---');
  const gateSource = require('fs').readFileSync(join(ROOT, 'scripts', 'lib', 'cto-approval-gate.ts'), 'utf-8');
  assert('CTO gate imports ACP', gateSource.includes("from '../../agents/lib/acp'"));
  assert('CTO gate has agent_capabilities field', gateSource.includes('agent_capabilities'));
  assert('CTO gate has ACP pre-check', gateSource.includes('ACP violation'));
  assert('CTO gate has acp_violations result field', gateSource.includes('acp_violations'));

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
