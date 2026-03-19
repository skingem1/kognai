/**
 * test-clawrouter-e2e.ts — ClawRouter v2.0 End-to-End Gateway Test
 *
 * Verifies that T3 APEX calls route through the OpenClaw gateway at :18789
 * rather than falling back to the direct Anthropic API.
 *
 * Strategy: temporarily unsets ANTHROPIC_API_KEY before the call so the
 * gateway fallback path is disabled — if the call succeeds, it MUST have
 * gone through the gateway.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

import { routeCall, clawRouterHealthCheck } from './lib/clawrouter-v2';

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   ClawRouter v2.0 — End-to-End Gateway Test     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // ── Step 1: Health Check ─────────────────────────────────────────────────
  console.log('[1] Running ClawRouter health check...');
  const health = await clawRouterHealthCheck();
  console.log(`    Ollama:   ${health.ollama   ? '✅ online' : '❌ offline'}`);
  console.log(`    Gateway:  ${health.gateway  ? '✅ online' : '❌ offline'}`);
  if (health.models.length > 0) {
    console.log(`    Models:   ${health.models.slice(0, 5).join(', ')}`);
  }
  console.log('');

  if (!health.gateway) {
    console.error('❌ FATAL: OpenClaw gateway not reachable at http://localhost:18789');
    console.error('   Run: openclaw gateway status');
    process.exit(1);
  }

  // ── Step 2: T3 APEX call — gateway-only (fallback disabled) ─────────────
  console.log('[2] T3 APEX gateway test (constitutional_flag: true)...');
  console.log('    Temporarily clearing ANTHROPIC_API_KEY to force gateway-only path...');

  const savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = '';  // disable direct-API fallback for this test

  let result;
  try {
    result = await routeCall({
      task_type:         'e2e_gateway_test',
      tier_class:        'text',
      complexity:        'apex',
      context_tokens:    100,
      constitutional_flag: true,
      agent_id:          'test-harness',
      payload: {
        system: 'You are a constitutional AI agent. Be concise.',
        prompt: 'Respond with exactly: "ClawRouter gateway operational."',
        max_tokens: 30,
      },
    });
  } finally {
    process.env.ANTHROPIC_API_KEY = savedKey || '';  // always restore
  }

  console.log('');
  console.log('    ┌─ Result ────────────────────────────────────┐');
  console.log(`    │  Model:   ${result.model}`);
  console.log(`    │  Tier:    ${result.tier}`);
  console.log(`    │  Local:   ${result.local}`);
  console.log(`    │  Cost:    $${result.cost_usd.toFixed(6)}`);
  console.log(`    │  Tokens:  in=${result.input_tokens} out=${result.output_tokens}`);
  console.log(`    │  Content: "${result.content.slice(0, 120)}"`);
  console.log('    └────────────────────────────────────────────┘');
  console.log('');

  // ── Step 3: Verdict ──────────────────────────────────────────────────────
  const expectedModel = 'anthropic/claude-sonnet-4-20250514';
  const modelOk   = result.model === expectedModel;
  const tierOk    = result.tier === 'T3';        // ClawRouter uses 'T3' not 'T3_APEX'
  const localOk   = result.local === false;
  const contentOk = result.content.length > 0;

  console.log('[3] Validation:');
  console.log(`    Model is ${expectedModel}: ${modelOk  ? '✅' : `❌ (got: ${result.model})`}`);
  console.log(`    Tier is T3 (APEX):          ${tierOk  ? '✅' : `❌ (got: ${result.tier})`}`);
  console.log(`    Routed to cloud (not local): ${localOk ? '✅' : '❌ (unexpectedly local)'}`);
  console.log(`    Response has content:        ${contentOk ? '✅' : '❌ (empty response)'}`);
  console.log('');

  if (modelOk && tierOk && localOk && contentOk) {
    console.log('✅ PASS — ClawRouter T3 APEX call routed through OpenClaw gateway (:18789)');
    console.log('         ANTHROPIC_API_KEY fallback was disabled — gateway is the sole path.\n');
  } else {
    console.error('❌ FAIL — One or more validation checks failed (see above)\n');
    process.exit(1);
  }

  // ── Step 4: Optional T2.5 EXEC test (cloud, non-constitutional) ─────────
  console.log('[4] T2.5 EXEC gateway test (complexity: exec, no constitutional)...');
  const savedKey2 = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = '';

  let result2;
  try {
    result2 = await routeCall({
      task_type:           'e2e_gateway_test_exec',
      tier_class:          'text',
      complexity:          'exec',
      context_tokens:      100,
      constitutional_flag: false,
      agent_id:            'test-harness',
      payload: {
        system: 'Be concise.',
        prompt: 'Reply with exactly: "T2.5 EXEC path verified."',
        max_tokens: 20,
      },
    });
  } finally {
    process.env.ANTHROPIC_API_KEY = savedKey2 || '';
  }

  console.log(`    Model:   ${result2.model}`);
  console.log(`    Tier:    ${result2.tier}`);
  console.log(`    Content: "${result2.content.slice(0, 120)}"\n`);

  if (result2.local === false && result2.content.length > 0) {
    console.log('✅ PASS — T2.5 EXEC also routes through gateway\n');
  } else if (result2.local === true) {
    console.log('ℹ️  T2.5 EXEC mapped to local tier (check resolveTextTier for exec complexity)\n');
  } else {
    console.warn('⚠️  T2.5 EXEC returned empty content\n');
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('ClawRouter e2e test complete.');
  console.log('Check logs/clawrouter/ for the JSONL cost log entries.');
}

main().catch(e => {
  console.error('\n❌ UNCAUGHT ERROR:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
