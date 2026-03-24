/**
 * Godman Protocols SDK — Complete Agent Workflow Example
 *
 * Demonstrates all 7 protocols working together in a real agent task:
 * An agent receives a task, gets constitutional clearance, creates a mandate,
 * allocates resources, routes with latency awareness, executes, scores the result,
 * and broadcasts completion via the event bus.
 *
 * Run: npx tsx workspace/godman-protocols/sdk/examples/agent-workflow.ts
 */

import {
  // SOUL — Constitutional safety (always first)
  createConstitution, signConstitution, evaluateAction, checkKillSwitches,

  // PACT — Coordination and trust
  createMandate, signMandate, verifyMandate, openFrame, closeFrame, addParticipant,

  // AMF — Agent messaging
  createEnvelope, verifyEnvelope, taskRequest, taskResult,

  // DRS — Resource scheduling
  ResourceScheduler,

  // LAX — Latency-aware execution
  createBudget, routeTask, registerSLA,

  // SIGNAL — Event bus
  EventBus, createEvent,

  // SCORE — Evaluation and reputation
  createRubric, evaluate, calculateReputation,
} from '../src/index.js';

// ── Setup ──

const orchestrator = 'agent:orchestrator';
const coder = 'agent:coder';
const reviewer = 'agent:reviewer';
const SECRET = 'demo-secret-key';

console.log('=== Godman Protocols — Agent Workflow Demo ===\n');

// ── Step 1: SOUL — Constitutional clearance ──
console.log('1. SOUL: Constitutional safety check');

const constitution = createConstitution(orchestrator, [
  { name: 'Block private data', description: 'No unauthorized data access', action: 'deny', enforcementLevel: 'hard', scope: 'access_private_data', bootstrapped: true },
  { name: 'Allow code gen', description: 'Allow code generation', action: 'allow', enforcementLevel: 'hard', scope: 'generate_code', bootstrapped: true },
  { name: 'Allow execution', description: 'Allow task execution', action: 'allow', enforcementLevel: 'hard', scope: 'execute_task', bootstrapped: true },
], [
  { name: 'Cost overrun', triggerCondition: 'cost_usd > 50', action: 'halt' },
]);

const signed = signConstitution(constitution, SECRET);
console.log(`   Constitution signed: ${signed.operatorId}`);

const clearance = evaluateAction(signed, coder, 'generate_code');
console.log(`   Action "generate_code": ${clearance.allowed ? 'ALLOWED' : 'DENIED'} — ${clearance.reason}`);

const killCheck = checkKillSwitches(signed, { cost_usd: 10 });
console.log(`   Kill switches: ${killCheck ? 'TRIGGERED: ' + killCheck.name : 'clear'}\n`);

// ── Step 2: PACT — Create coordination frame + mandate ──
console.log('2. PACT: Mandate and coordination');

let frame = openFrame(orchestrator);
frame = addParticipant(frame, coder);
frame = addParticipant(frame, reviewer);
console.log(`   Frame opened: ${frame.id.slice(0, 12)}... (${frame.participants.length} participants)`);

const mandate = createMandate(orchestrator, coder, {
  description: 'Generate retry logic for feature.ts',
  actions: ['write', 'execute'],
  resources: ['scripts/feature.ts'],
  maxPaymentUsdc: null,
}, { expiresAt: new Date(Date.now() + 3600_000).toISOString() });

const signedMandate = signMandate(mandate, SECRET);
const verified = verifyMandate(signedMandate, SECRET);
console.log(`   Mandate: ${mandate.id.slice(0, 12)}... verified=${verified.valid}\n`);

// ── Step 3: AMF — Send task request message ──
console.log('3. AMF: Agent messaging');

const taskPayload = taskRequest(
  'task-001',
  'Add retry logic to feature.ts',
  { file: 'scripts/feature.ts', spec: 'Add exponential backoff retry' },
);

const envelope = createEnvelope(orchestrator, coder, taskPayload, SECRET);
const envVerified = verifyEnvelope(envelope, SECRET);
console.log(`   Envelope: ${envelope.id.slice(0, 12)}... from=${envelope.sender} verified=${envVerified}\n`);

// ── Step 4: DRS — Allocate resources ──
console.log('4. DRS: Resource allocation');

const scheduler = new ResourceScheduler();
scheduler.addPool({
  name: 'GPU Compute', resourceType: 'gpu-a100',
  totalCapacity: 4, availableCapacity: 4,
  latencyMs: 5, costPerUnitUsdc: 0, tags: [],
});
scheduler.addPool({
  name: 'Model Slots', resourceType: 'qwen3:14b',
  totalCapacity: 2, availableCapacity: 2,
  latencyMs: 10, costPerUnitUsdc: 0, tags: [],
});

const pools = scheduler.listPools();
const gpuPool = pools[0];
const modelPool = pools[1];

const gpuAlloc = scheduler.allocate({
  id: 'alloc-gpu-1', requestingAgent: coder, poolId: gpuPool.id,
  unitsRequested: 1, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1,
  requestedAt: new Date().toISOString(),
});

const modelAlloc = scheduler.allocate({
  id: 'alloc-model-1', requestingAgent: coder, poolId: modelPool.id,
  unitsRequested: 1, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1,
  requestedAt: new Date().toISOString(),
});
console.log(`   GPU allocated: ${gpuAlloc!.id.slice(0, 12)}...`);
console.log(`   Model slot allocated: ${modelAlloc!.id.slice(0, 12)}...\n`);

// ── Step 5: LAX — Route with latency awareness ──
console.log('5. LAX: Latency-aware routing');

const budget = createBudget(5000, 3000);
const sla = registerSLA(coder, 'mac-mini-m4', 10000, 5);
console.log(`   SLA registered: ${sla.id.slice(0, 12)}... (max ${sla.maxLatencyMs}ms)`);

const route = routeTask('task-001', coder, budget, [
  { id: 'slot-local', runtimeId: 'mac-mini-m4', measuredLatencyMs: 3000, available: true },
  { id: 'slot-cloud', runtimeId: 'hetzner-vps', measuredLatencyMs: 1000, available: true },
]);
console.log(`   Routed to: ${route.selectedRuntimeId} (${route.estimatedLatencyMs}ms) — ${route.reason}\n`);

// ── Step 6: SIGNAL — Broadcast task started ──
console.log('6. SIGNAL: Event broadcasting');

const bus = new EventBus();
const events: string[] = [];

bus.subscribe(reviewer, 'task.*', (evt) => { events.push(evt.topic); });

await bus.publish(createEvent(coder, 'task.started', { taskId: 'task-001' }, SECRET));
await bus.publish(createEvent(coder, 'task.completed', { taskId: 'task-001', linesWritten: 45 }, SECRET));

console.log(`   Events delivered: ${events.join(', ')}\n`);

// ── Step 7: SCORE — Evaluate the result ──
console.log('7. SCORE: Result evaluation');

const rubric = createRubric('code-quality', [
  { name: 'Correctness', weight: 0.4, description: 'Code works as specified' },
  { name: 'Style', weight: 0.3, description: 'Follows project conventions' },
  { name: 'Efficiency', weight: 0.3, description: 'No unnecessary complexity' },
]);

const evaluation = evaluate(
  rubric, coder, 'task-001',
  { [rubric.criteria[0].id]: 0.95, [rubric.criteria[1].id]: 0.85, [rubric.criteria[2].id]: 0.90 },
  reviewer, SECRET,
);
console.log(`   Score: ${(evaluation.compositeScore * 100).toFixed(1)}%`);

const reputation = calculateReputation(coder, [evaluation]);
console.log(`   Reputation: ${(reputation.score * 100).toFixed(1)}% (${reputation.evaluationCount} eval)\n`);

// ── Cleanup ──
scheduler.release(gpuAlloc!.id);
scheduler.release(modelAlloc!.id);
frame = closeFrame(frame);

const resultPayload = taskResult('task-001', 'success', { linesWritten: 45, score: evaluation.compositeScore });
const resultEnvelope = createEnvelope(coder, orchestrator, resultPayload, SECRET);

console.log('=== Workflow Complete ===');
console.log(`Frame: ${frame.status}`);
console.log(`Resources: released`);
console.log(`Score: ${(evaluation.compositeScore * 100).toFixed(1)}%`);
console.log(`Events: ${events.length} delivered`);
console.log(`Result: ${resultEnvelope.id.slice(0, 12)}...`);
