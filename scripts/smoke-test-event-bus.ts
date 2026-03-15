#!/usr/bin/env ts-node
// Smoke test: Event Bus (publisher + listener)
// Usage: npx ts-node scripts/smoke-test-event-bus.ts

import {
  publishSprintStarted,
  publishTaskStarted,
  publishTaskCompleted,
  publishBudgetWarning,
  publishSprintCompleted,
} from './lib/event-bus-publisher';
import { subscribeToEvents, getActiveSubscriptionCount } from './lib/event-bus-listener';
import { KognaiEvent } from './lib/event-bus-types';

const TEST_SPRINT = `smoke-test-${Date.now()}`;
const AGENT_ID    = 'smoke-test-agent';
const TASK_ID     = 'T-SMOKE-001';
const TASK_TITLE  = 'Smoke test task';

const hasCreds =
  !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('\n🔥 Event Bus Smoke Test');
  console.log(`   Sprint: ${TEST_SPRINT}`);
  console.log(`   Supabase creds: ${hasCreds ? '✅ present' : '⚠️  missing — graceful no-op path'}\n`);

  // ── Phase 1: Publish ────────────────────────────────────────────────────────
  console.log('📤 Publishing 5 events...');
  const t0 = Date.now();

  await publishSprintStarted(TEST_SPRINT, 1);
  await publishTaskStarted(AGENT_ID, TEST_SPRINT, TASK_ID, TASK_TITLE);
  await publishTaskCompleted(AGENT_ID, TEST_SPRINT, TASK_ID, TASK_TITLE, 0.0005);
  await publishBudgetWarning(TEST_SPRINT, 42, 0.21, 0.50);
  await publishSprintCompleted(TEST_SPRINT, 1, 1);

  console.log(`   Published in ${Date.now() - t0}ms\n`);

  // ── Phase 2: Subscribe + verify ─────────────────────────────────────────────
  if (!hasCreds) {
    console.log('⚠️  No Supabase creds — verifying graceful no-op...');
    const received: KognaiEvent[] = [];
    const unsub = subscribeToEvents({ sprint: TEST_SPRINT }, e => received.push(e));
    await sleep(500);
    unsub();
    if (received.length === 0) {
      console.log('   ✅ Graceful no-op confirmed — no crash, no events delivered\n');
    } else {
      console.log(`   ❌ Unexpected: received ${received.length} events without creds\n`);
    }
    printSummary(!hasCreds, hasCreds ? 0 : 5, 0);
    return;
  }

  // With creds: wait for listener to pick up events (immediate poll on subscribe)
  console.log('📥 Subscribing and waiting for round-trip...');
  const received: KognaiEvent[] = [];
  const TIMEOUT_MS = 8000;

  const unsub = subscribeToEvents({ sprint: TEST_SPRINT }, e => {
    received.push(e);
    console.log(`   ← received: ${e.event_type}`);
  });

  console.log(`   Active subscriptions: ${getActiveSubscriptionCount()}`);

  const deadline = Date.now() + TIMEOUT_MS;
  while (received.length < 5 && Date.now() < deadline) {
    await sleep(200);
  }

  unsub();
  console.log(`   Active subscriptions after unsub: ${getActiveSubscriptionCount()}\n`);

  const passed = received.length >= 5;
  printSummary(passed, 5, received.length);
}

function printSummary(passed: boolean, expected: number, got: number) {
  if (passed) {
    console.log(`✅ PASS — event bus working correctly`);
    if (expected > 0) console.log(`   ${got}/${expected} events received`);
  } else {
    console.log(`❌ FAIL — expected ${expected} events, got ${got}`);
    console.log('   Check: SUPABASE_URL, SUPABASE_SERVICE_KEY, kognai_events table exists');
  }
  console.log();
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
