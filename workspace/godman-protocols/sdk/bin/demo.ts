#!/usr/bin/env node
/**
 * Godman Protocols — Interactive CLI Demo
 * Sprint 988: All 7 protocols in a realistic agent workflow.
 * Usage: npx tsx bin/demo.ts
 */

import {
  createConstitution, signConstitution, evaluateAction, checkKillSwitches,
  createMandate, signMandate, verifyMandate, openFrame, addParticipant, closeFrame,
  createEnvelope, verifyEnvelope, taskRequest,
  ResourceScheduler,
  createBudget, createProbe, routeTask, registerSLA, checkSLACompliance,
  EventBus, createEvent,
  createRubric, evaluate, calculateReputation,
  SDK_VERSION,
} from '../src/index.js';

const orchestrator = 'agent:orchestrator';
const coder = 'agent:coder';
const SECRET = 'demo-secret-key';

const C = {
  r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
  g: '\x1b[32m', bl: '\x1b[34m', m: '\x1b[35m',
  c: '\x1b[36m', rd: '\x1b[31m', w: '\x1b[37m',
};

function hdr(t: string) {
  console.log(`\n${C.b}${C.c}${'─'.repeat(60)}${C.r}`);
  console.log(`${C.b}${C.w}  ${t}${C.r}`);
  console.log(`${C.c}${'─'.repeat(60)}${C.r}\n`);
}
function ok(t: string) { console.log(`  ${C.g}✓${C.r}  ${t}`); }
function info(t: string) { console.log(`  ${C.bl}→${C.r}  ${t}`); }

async function demo() {
  console.log(`\n${C.b}${C.m}╔══════════════════════════════════════════════════════════╗${C.r}`);
  console.log(`${C.b}${C.m}║${C.r}  ${C.b}Godman Protocols${C.r} — Full Agent Workflow Demo ${C.d}v${SDK_VERSION}${C.r}  ${C.b}${C.m}║${C.r}`);
  console.log(`${C.b}${C.m}╚══════════════════════════════════════════════════════════╝${C.r}`);

  // ── 1. SOUL ──
  hdr('1/7  SOUL — Constitutional Safety');
  const constitution = createConstitution('kognai-operator', [
    { name: 'no-delete', description: 'No user deletion', action: 'deny', enforcementLevel: 'hard', scope: 'delete_user', bootstrapped: true },
    { name: 'allow-code', description: 'Allow code generation', action: 'allow', enforcementLevel: 'hard', scope: 'generate_code', bootstrapped: true },
  ], [
    { name: 'memory-limit', triggerCondition: 'memory_gb > 22', action: 'halt' },
  ]);
  const signedConst = signConstitution(constitution, SECRET);
  ok(`Constitution signed: ${signedConst.operatorId} (${signedConst.constraints.length} constraints)`);
  const evalAllow = evaluateAction(signedConst, coder, 'generate_code');
  const evalDeny = evaluateAction(signedConst, coder, 'delete_user');
  ok(`"generate_code" → ${C.g}${evalAllow.allowed ? 'ALLOWED' : 'DENIED'}${C.r}`);
  ok(`"delete_user"   → ${C.rd}${evalDeny.allowed ? 'ALLOWED' : 'DENIED'}${C.r}`);
  const ks = checkKillSwitches(signedConst, { memory_gb: 10 });
  ok(`Kill switches: ${ks ? C.rd + 'TRIGGERED' : C.g + 'CLEAR'}${C.r}`);

  // ── 2. PACT ──
  hdr('2/7  PACT — Agent Coordination');
  let frame = openFrame(orchestrator);
  frame = addParticipant(frame, coder);
  ok(`Frame: ${frame.id.slice(0, 12)}... (${frame.participants.length} participants)`);
  const mandate = createMandate(orchestrator, coder, {
    description: 'Implement Sprint 988', actions: ['write', 'execute'],
    resources: ['sdk/bin/demo.ts'], maxPaymentUsdc: null,
  });
  const signedM = signMandate(mandate, SECRET);
  const vr = verifyMandate(signedM, SECRET);
  ok(`Mandate: ${signedM.id.slice(0, 12)}... verified=${C.g}${vr.valid}${C.r}`);
  const closed = closeFrame(frame, 'completed');
  ok(`Frame closed: ${C.g}${closed.status}${C.r}`);

  // ── 3. AMF ──
  hdr('3/7  AMF — Agent Message Format');
  const payload = taskRequest('task-001', 'Build CLI demo', { sprint: 988 });
  const envelope = createEnvelope(orchestrator, coder, payload, SECRET);
  ok(`Envelope: ${envelope.id.slice(0, 12)}... type=${envelope.payload.type}`);
  const evr = verifyEnvelope(envelope, SECRET);
  ok(`Integrity: ${evr ? C.g + 'VERIFIED' : C.rd + 'FAILED'}${C.r}`);
  info(`${envelope.sender} → ${envelope.recipient}`);

  // ── 4. DRS ──
  hdr('4/7  DRS — Dynamic Resource Scheduling');
  const scheduler = new ResourceScheduler();
  scheduler.addPool({
    name: 'GPU Compute', resourceType: 'gpu-a100',
    totalCapacity: 4, availableCapacity: 4,
    latencyMs: 5, costPerUnit: 0,
  });
  const pools = scheduler.listPools();
  const gpuPool = pools[0];
  ok(`Pool: ${gpuPool.name} (${gpuPool.totalCapacity} units)`);

  const alloc = scheduler.allocate({
    id: 'alloc-gpu-1', requestingAgent: coder, poolId: gpuPool.id,
    unitsRequested: 2, priority: 'high', maxLatencyMs: 100, maxCostUsdc: 1,
    requestedAt: new Date().toISOString(),
  });
  ok(`Allocated: ${alloc!.unitsAllocated} GPUs → ${alloc!.agentId}`);
  scheduler.release(alloc!.id);
  ok(`Released → pool restored`);

  // ── 5. LAX ──
  hdr('5/7  LAX — Latency-Aware Execution');
  const budget = createBudget(5000, 3000);
  ok(`Budget: max ${budget.maxLatencyMs}ms, target ${budget.targetLatencyMs}ms`);
  const sla = registerSLA(coder, 'mac-mini-m4', 10000, 5);
  ok(`SLA: ${sla.id.slice(0, 12)}... (max ${sla.maxLatencyMs}ms)`);
  const route = routeTask('task-001', coder, budget, [
    { id: 'local', runtimeId: 'mac-mini-m4', measuredLatencyMs: 3000, available: true, lastProbeAt: new Date().toISOString() },
    { id: 'cloud', runtimeId: 'hetzner-vps', measuredLatencyMs: 1000, available: true, lastProbeAt: new Date().toISOString() },
  ]);
  ok(`Route: ${C.g}${route.selectedRuntimeId}${C.r} (${route.estimatedLatencyMs}ms)`);

  // ── 6. SIGNAL ──
  hdr('6/7  SIGNAL — Event Pub/Sub');
  const bus = new EventBus();
  let received = 0;
  bus.subscribe('dashboard', 'sprint.*', (_evt) => { received++; });
  ok(`Subscribed: dashboard → sprint.*`);
  await bus.publish(createEvent(coder, 'sprint.completed', { status: 'PASS' }, SECRET));
  await bus.publish(createEvent(coder, 'sprint.metrics', { tests: 25 }, SECRET));
  ok(`Published 2 events → ${received} delivered`);

  // ── 7. SCORE ──
  hdr('7/7  SCORE — Scoring & Reputation');
  const rubric = createRubric('code-quality', [
    { name: 'Correctness', weight: 0.4, description: 'Code works as specified' },
    { name: 'Style', weight: 0.3, description: 'Follows conventions' },
    { name: 'Tests', weight: 0.3, description: 'Adequate test coverage' },
  ]);
  ok(`Rubric: ${rubric.name} (${rubric.criteria.length} criteria)`);
  const scores1: Record<string, number> = {};
  rubric.criteria.forEach((c, i) => { scores1[c.id] = [0.95, 0.85, 0.80][i]; });
  const e1 = evaluate(rubric, coder, 'sprint-988-demo', scores1, 'supervisor', SECRET);
  ok(`Score: ${C.b}${(e1.compositeScore * 100).toFixed(1)}%${C.r}`);
  const scores2: Record<string, number> = {};
  rubric.criteria.forEach((c, i) => { scores2[c.id] = [0.98, 0.92, 0.88][i]; });
  const e2 = evaluate(rubric, coder, 'sprint-988-fix', scores2, 'supervisor', SECRET);
  const rep = calculateReputation(coder, [e1, e2]);
  ok(`Reputation: ${C.b}${C.g}${(rep.score * 100).toFixed(1)}%${C.r} (${rep.evaluationCount} evals)`);

  // ── Summary ──
  console.log(`\n${C.b}${C.m}╔══════════════════════════════════════════════════════════╗${C.r}`);
  console.log(`${C.b}${C.m}║${C.r}  ${C.g}${C.b}All 7 protocols demonstrated successfully${C.r}            ${C.b}${C.m}║${C.r}`);
  console.log(`${C.b}${C.m}║${C.r}  SOUL → PACT → AMF → DRS → LAX → SIGNAL → SCORE        ${C.b}${C.m}║${C.r}`);
  console.log(`${C.b}${C.m}║${C.r}  ${C.d}github.com/skingem1/kognai${C.r}                             ${C.b}${C.m}║${C.r}`);
  console.log(`${C.b}${C.m}╚══════════════════════════════════════════════════════════╝${C.r}\n`);
}

demo().catch(e => { console.error(`${C.rd}Demo failed:${C.r}`, e.message); process.exit(1); });
