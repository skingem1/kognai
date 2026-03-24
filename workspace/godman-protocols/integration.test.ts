/**
 * Godman Protocols — Cross-Protocol Integration Test
 * Proves all 7 protocols work together in an end-to-end agent workflow.
 *
 * Scenario: Harvey (CEO) delegates a task to Messi (Coder) via PACT mandate,
 * SOUL validates it, SIGNAL broadcasts events, SCORE evaluates output,
 * AMF wraps messages, DRS allocates compute, LAX routes to optimal runtime.
 *
 * Run: cd workspace/godman-protocols && npx tsx integration.test.ts
 */

import { strict as assert } from 'node:assert';

// --- PACT: Mandate lifecycle ---
import { createMandate, signMandate, verifyMandate, openFrame, addParticipant, closeFrame, MandateRegistry } from './pact/src/index.js';

// --- SOUL: Constitutional check ---
import { createConstitution, signConstitution, evaluateAction, checkKillSwitches } from './soul/src/index.js';
import type { Constitution } from './soul/src/types.js';

// --- SIGNAL: Event bus ---
import { EventBus, createEvent } from './signal/src/index.js';
import type { Event } from './signal/src/types.js';

// --- SCORE: Evaluation ---
import { createRubric, evaluate, calculateReputation } from './score/src/index.js';

// --- AMF: Message format ---
import { createEnvelope, verifyEnvelope, taskRequest, taskResult } from './amf/src/index.js';

// --- DRS: Resource scheduling ---
import { ResourceScheduler } from './drs/src/index.js';
import type { AllocationRequest } from './drs/src/types.js';

// --- LAX: Latency-aware routing ---
import { createBudget, createProbe, routeTask, registerSLA, checkSLACompliance } from './lax/src/index.js';
import type { ExecutionSlot } from './lax/src/types.js';

let passed = 0;
const HARVEY_SECRET = 'harvey-ceo-secret';
const MESSI_SECRET = 'messi-coder-secret';
const OPERATOR_SECRET = 'operator-constitutional-secret';

console.log('=== Godman Protocols Integration Test ===\n');

// =========================================================================
// STEP 1: SOUL — Load constitutional constraints
// =========================================================================
const rawConstitution = createConstitution('operator-tarek', [
  { name: 'Allow task delegation', description: 'CEO may delegate tasks', action: 'allow', enforcementLevel: 'hard', scope: 'delegate:*', bootstrapped: true },
  { name: 'Allow code writes', description: 'Coders may write code', action: 'allow', enforcementLevel: 'hard', scope: 'write:workspace/*', bootstrapped: true },
  { name: 'Deny secrets', description: 'No .env access', action: 'deny', enforcementLevel: 'hard', scope: 'read:*.env*', bootstrapped: true },
], [
  { name: 'Low views', triggerCondition: 'views_per_30_posts < 500', action: 'halt' },
]);
const constitution = signConstitution(rawConstitution as Constitution, OPERATOR_SECRET);

// Verify delegation is allowed
const soulCheck = evaluateAction(constitution, 'did:kognai:harvey', 'delegate:task-sprint-972');
assert.equal(soulCheck.allowed, true);
passed++;
console.log('✓ SOUL: Constitutional check — delegation allowed');

// Verify .env access is denied
const envCheck = evaluateAction(constitution, 'did:kognai:messi', 'read:production.env.local');
assert.equal(envCheck.allowed, false);
passed++;
console.log('✓ SOUL: Constitutional check — .env access denied');

// No kill switches triggered (healthy metrics)
const ks = checkKillSwitches(constitution, { views_per_30_posts: 1200, memory_gb: 16 });
assert.equal(ks, null);
passed++;
console.log('✓ SOUL: No kill switches triggered');

// =========================================================================
// STEP 2: PACT — Create and sign mandate
// =========================================================================
const mandate = createMandate('did:kognai:harvey', 'did:kognai:messi', {
  description: 'Messi may write code in workspace/scs001',
  actions: ['read', 'write'],
  resources: ['workspace/scs001/*'],
  maxPaymentUsdc: 5.00,
}, { expiresAt: new Date(Date.now() + 86_400_000).toISOString() });

const signedMandate = signMandate(mandate, HARVEY_SECRET);
const registry = new MandateRegistry();
registry.store(signedMandate);

const verification = verifyMandate(signedMandate, HARVEY_SECRET, registry.revocationLedger);
assert.equal(verification.valid, true);
passed++;
console.log('✓ PACT: Mandate created, signed, verified');

// Open coordination frame
let frame = openFrame('did:kognai:harvey', [signedMandate.id]);
frame = addParticipant(frame, 'did:kognai:messi');
frame = addParticipant(frame, 'did:kognai:sherlock');
assert.equal(frame.participants.length, 3);
assert.equal(frame.status, 'open');
passed++;
console.log('✓ PACT: Coordination frame opened with 3 agents');

// =========================================================================
// STEP 3: AMF — Harvey sends task request to Messi
// =========================================================================
const taskReq = taskRequest('sprint-972-task', 'Implement DRS integration', { files: ['drs/scheduler.ts'] });
const amfEnvelope = createEnvelope('did:kognai:harvey', 'did:kognai:messi', taskReq, HARVEY_SECRET);
assert.equal(verifyEnvelope(amfEnvelope, HARVEY_SECRET), true);
passed++;
console.log('✓ AMF: Task request envelope created and verified');

// =========================================================================
// STEP 4: DRS — Allocate compute resources
// =========================================================================
const scheduler = new ResourceScheduler();
scheduler.addPool({ id: 'mac-mini', name: 'Mac Mini M4', resourceType: 'qwen3:14b', totalCapacity: 10, availableCapacity: 10, costPerUnit: 0.00, latencyMs: 40 });
scheduler.addPool({ id: 'hetzner', name: 'Hetzner VPS', resourceType: 'claude-sonnet', totalCapacity: 5, availableCapacity: 5, costPerUnit: 0.03, latencyMs: 150 });

const allocReq: AllocationRequest = {
  id: 'alloc-972', requestingAgent: 'did:kognai:messi', poolId: 'mac-mini',
  unitsRequested: 2, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1.00,
  requestedAt: new Date().toISOString(),
};
const allocation = scheduler.allocate(allocReq);
assert.ok(allocation);
assert.equal(allocation!.status, 'active');
assert.equal(allocation!.poolId, 'mac-mini');
passed++;
console.log('✓ DRS: Compute allocated (Mac Mini, 2 units)');

// =========================================================================
// STEP 5: LAX — Route to optimal runtime
// =========================================================================
const budget = createBudget(200, 50);
const slots: ExecutionSlot[] = [
  { id: 's1', runtimeId: 'mac-mini-m4', measuredLatencyMs: 40, available: true, lastProbeAt: new Date().toISOString() },
  { id: 's2', runtimeId: 'hetzner-vps', measuredLatencyMs: 150, available: true, lastProbeAt: new Date().toISOString() },
];
const routing = routeTask('sprint-972-task', 'did:kognai:messi', budget, slots);
assert.equal(routing.selectedRuntimeId, 'mac-mini-m4'); // closest to target 50ms
assert.equal(routing.reason, 'within_target');
passed++;
console.log('✓ LAX: Routed to Mac Mini (40ms, within target)');

// SLA check
const sla = registerSLA('did:kognai:messi', 'mac-mini-m4', 100, 10);
const probe = createProbe('mac-mini-m4', 40, true);
const compliance = checkSLACompliance(sla, probe);
assert.equal(compliance.compliant, true);
passed++;
console.log('✓ LAX: SLA compliance check passed');

// =========================================================================
// STEP 6: SIGNAL — Broadcast task completion event
// =========================================================================
const bus = new EventBus();
const receivedEvents: Event[] = [];
bus.subscribe('did:kognai:sherlock', 'task.**', (e) => receivedEvents.push(e));
bus.subscribe('did:kognai:harvey', 'task.completed', (e) => receivedEvents.push(e));

const completionEvent = createEvent('did:kognai:messi', 'task.completed', {
  taskId: 'sprint-972-task', status: 'success', filesCreated: ['drs/scheduler.ts'],
}, MESSI_SECRET);
const receipts = await bus.publish(completionEvent);
assert.equal(receipts.length, 2); // both subscribers match
assert.equal(receivedEvents.length, 2);
passed++;
console.log('✓ SIGNAL: Task completion broadcasted to 2 subscribers');

// =========================================================================
// STEP 7: AMF — Messi sends result back to Harvey
// =========================================================================
const resultPayload = taskResult('sprint-972-task', 'success', { filesCreated: 1, linesWritten: 179 });
const resultEnvelope = createEnvelope('did:kognai:messi', 'did:kognai:harvey', resultPayload, MESSI_SECRET);
assert.equal(verifyEnvelope(resultEnvelope, MESSI_SECRET), true);
passed++;
console.log('✓ AMF: Task result envelope sent and verified');

// =========================================================================
// STEP 8: SCORE — Sherlock evaluates Messi's output
// =========================================================================
const rubric = createRubric('Code Quality', [
  { name: 'Correctness', description: 'Does it work?', weight: 0.4 },
  { name: 'Readability', description: 'Is it readable?', weight: 0.3 },
  { name: 'Coverage', description: 'Test coverage?', weight: 0.3 },
]);
const scores: Record<string, number> = {};
scores[rubric.criteria[0].id] = 0.95; // Correctness
scores[rubric.criteria[1].id] = 0.90; // Readability
scores[rubric.criteria[2].id] = 0.85; // Coverage
const evaluation = evaluate(rubric, 'did:kognai:messi', 'sprint-972-task', scores, 'did:kognai:sherlock', OPERATOR_SECRET);
assert.ok(evaluation.compositeScore > 0.9); // 0.95*0.4 + 0.90*0.3 + 0.85*0.3 = 0.905
passed++;
console.log(`✓ SCORE: Messi scored ${evaluation.compositeScore.toFixed(3)} (excellent)`);

// Calculate reputation
const reputation = calculateReputation('did:kognai:messi', [evaluation]);
assert.ok(reputation.score > 0.9);
assert.equal(reputation.evaluationCount, 1);
passed++;
console.log(`✓ SCORE: Messi reputation ${reputation.score.toFixed(3)}`);

// =========================================================================
// STEP 9: PACT — Close coordination frame
// =========================================================================
frame = closeFrame(frame);
assert.equal(frame.status, 'closed');
passed++;
console.log('✓ PACT: Coordination frame closed');

// =========================================================================
// STEP 10: DRS — Release compute allocation
// =========================================================================
const released = scheduler.release(allocation!.id);
assert.equal(released, true);
assert.equal(scheduler.getPool('mac-mini')!.availableCapacity, 10);
passed++;
console.log('✓ DRS: Compute released, capacity restored');

// =========================================================================
// EDGE CASE 1: SOUL — Constitutional rejection (forbidden action)
// =========================================================================
const forbiddenCheck = evaluateAction(constitution, 'did:kognai:messi', 'read:.env.production');
assert.equal(forbiddenCheck.allowed, false);
passed++;
console.log('✓ EDGE: SOUL rejects .env.production access');

// =========================================================================
// EDGE CASE 2: SOUL — Kill switch fires when views are below threshold
// =========================================================================
const killFired = checkKillSwitches(constitution, { views_per_30_posts: 200 });
assert.ok(killFired !== null);
assert.equal(killFired!.action, 'halt');
passed++;
console.log(`✓ EDGE: SOUL kill switch fires — action: ${killFired!.action}`);

// =========================================================================
// EDGE CASE 3: PACT — Revoked mandate is rejected
// =========================================================================
import { revokeMandate } from './pact/src/index.js';
const tempMandate = signMandate(
  createMandate('did:kognai:harvey', 'did:kognai:guardiola', {
    description: 'Temp deploy mandate', actions: ['deploy'], resources: ['prod/*'], maxPaymentUsdc: 1.00,
  }, { expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
  HARVEY_SECRET,
);
const revokeRegistry = new MandateRegistry();
revokeRegistry.store(tempMandate);
const revokeEntry = revokeMandate(tempMandate.id, 'did:kognai:harvey', HARVEY_SECRET, 'Revoked: security review');
revokeRegistry.addRevocation(revokeEntry);
const revokeCheck = verifyMandate(tempMandate, HARVEY_SECRET, revokeRegistry.revocationLedger);
assert.equal(revokeCheck.valid, false);
assert.equal((revokeCheck as any).reason, 'revoked');
passed++;
console.log('✓ EDGE: PACT rejects revoked mandate');

// =========================================================================
// EDGE CASE 4: DRS — Resource pool exhaustion guard
// =========================================================================
const tinyScheduler = new ResourceScheduler();
tinyScheduler.addPool({ id: 'tiny-pool', name: 'Tiny Pool', resourceType: 'nano', totalCapacity: 1, availableCapacity: 1, costPerUnit: 0.001, latencyMs: 10 });
const firstAlloc = tinyScheduler.allocate({ id: 'a1', requestingAgent: 'did:kognai:messi', poolId: 'tiny-pool', unitsRequested: 1, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1.00, requestedAt: new Date().toISOString() });
assert.ok(firstAlloc);
const secondAlloc = tinyScheduler.allocate({ id: 'a2', requestingAgent: 'did:kognai:harvey', poolId: 'tiny-pool', unitsRequested: 1, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1.00, requestedAt: new Date().toISOString() });
assert.equal(secondAlloc, null); // pool exhausted
passed++;
console.log('✓ EDGE: DRS guards against pool exhaustion (second alloc returns null)');

// =========================================================================
// EDGE CASE 5: LAX — SLA breach detected when latency exceeds budget
// =========================================================================
// SLA already imported at top of file; createProbe also imported
const tightSLA = registerSLA('did:kognai:messi', 'mac-mini', 500, 10);
// Simulate probe showing 800ms latency — exceeds 500ms SLA
const slowProbe = createProbe('mac-mini', 800, true);
const slaResult = checkSLACompliance(tightSLA, slowProbe);
assert.equal(slaResult.compliant, false);
assert.ok(slaResult.reason.includes('latency_exceeded'));
passed++;
console.log(`✓ EDGE: LAX detects SLA breach (800ms > 500ms)`);

// =========================================================================
console.log(`\n✅ All ${passed} integration assertions passed`);
console.log('=== All 7 Godman Protocols working together ===');
console.log('   SOUL → PACT → AMF → DRS → LAX → SIGNAL → SCORE');
console.log('   + 5 edge cases: rejection, kill switch, revoke, exhaustion, SLA breach');
