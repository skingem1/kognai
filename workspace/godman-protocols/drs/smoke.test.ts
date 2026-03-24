/**
 * DRS smoke test — pools, allocate, release, preempt, expire
 * Run: npx tsx smoke.test.ts
 */

import { strict as assert } from 'node:assert';
import { ResourceScheduler, DRS_VERSION } from './src/index.js';
import type { AllocationRequest } from './src/types.js';

let passed = 0;

// --- Version ---
assert.equal(DRS_VERSION, '0.2');
passed++;
console.log('✓ DRS_VERSION is 0.2');

// --- Pool management ---
const sched = new ResourceScheduler();
const pool = sched.addPool({
  name: 'Mac Mini M4',
  resourceType: 'qwen3:14b',
  totalCapacity: 10,
  availableCapacity: 10,
  costPerUnit: 0.00,
  latencyMs: 40,
});
assert.ok(pool.id);
assert.equal(pool.name, 'Mac Mini M4');
assert.equal(pool.availableCapacity, 10);
passed++;
console.log('✓ addPool: basic');

const pools = sched.listPools();
assert.equal(pools.length, 1);
passed++;
console.log('✓ listPools: returns registered pools');

// --- Allocation ---
const req: AllocationRequest = {
  id: 'req-1',
  requestingAgent: 'did:kognai:messi',
  poolId: pool.id,
  unitsRequested: 3,
  priority: 'medium',
  maxLatencyMs: 100,
  maxCostUsdc: 1.00,
  requestedAt: new Date().toISOString(),
};
const alloc = sched.allocate(req);
assert.ok(alloc);
assert.equal(alloc!.unitsAllocated, 3);
assert.equal(alloc!.status, 'active');
assert.equal(alloc!.costUsdc, 0); // free pool
assert.equal(sched.getPool(pool.id)!.availableCapacity, 7);
passed++;
console.log('✓ allocate: basic allocation');

// --- Allocation failure: insufficient capacity ---
const bigReq: AllocationRequest = {
  ...req, id: 'req-big', unitsRequested: 20,
};
const failAlloc = sched.allocate(bigReq);
assert.equal(failAlloc, null);
passed++;
console.log('✓ allocate: rejects insufficient capacity');

// --- Allocation failure: latency exceeded ---
const slowReq: AllocationRequest = {
  ...req, id: 'req-slow', maxLatencyMs: 10,
};
const slowFail = sched.allocate(slowReq);
assert.equal(slowFail, null);
passed++;
console.log('✓ allocate: rejects latency exceeded');

// --- Release ---
const released = sched.release(alloc!.id);
assert.equal(released, true);
assert.equal(sched.getAllocation(alloc!.id)!.status, 'released');
assert.equal(sched.getPool(pool.id)!.availableCapacity, 10);
passed++;
console.log('✓ release: returns capacity');

// --- Release non-existent ---
const badRelease = sched.release('nonexistent');
assert.equal(badRelease, false);
passed++;
console.log('✓ release: rejects nonexistent');

// --- Preemption ---
const alloc2 = sched.allocate({ ...req, id: 'req-2', priority: 'low' });
assert.ok(alloc2);

const preemptReq: AllocationRequest = {
  ...req, id: 'req-preempt', priority: 'critical', requestingAgent: 'did:kognai:harvey',
};
const preemptResult = sched.preempt(alloc2!.id, preemptReq);
assert.ok(preemptResult);
assert.equal(preemptResult!.preemption.preemptedAgent, 'did:kognai:messi');
assert.equal(preemptResult!.preemption.preemptingAgent, 'did:kognai:harvey');
assert.equal(preemptResult!.allocation.agentId, 'did:kognai:harvey');
assert.equal(sched.getAllocation(alloc2!.id)!.status, 'preempted');
passed++;
console.log('✓ preempt: critical overrides low priority');

// --- Preemption denied (low priority) ---
const alloc3 = sched.allocate({ ...req, id: 'req-3' });
assert.ok(alloc3);
const lowPreempt = sched.preempt(alloc3!.id, { ...req, id: 'req-low', priority: 'low' });
assert.equal(lowPreempt, null);
passed++;
console.log('✓ preempt: denies low-priority preemption');

// --- Expiry ---
const sched2 = new ResourceScheduler();
const pool2 = sched2.addPool({
  name: 'Cloud', resourceType: 'claude', totalCapacity: 5,
  availableCapacity: 5, costPerUnit: 0.01, latencyMs: 200,
});
const shortAlloc = sched2.allocate({
  id: 'req-short', requestingAgent: 'agent-a', poolId: pool2.id,
  unitsRequested: 2, priority: 'medium', maxLatencyMs: 500,
  maxCostUsdc: 1.00, requestedAt: new Date().toISOString(),
}, 1); // 1ms duration
// Wait briefly for expiry
const future = new Date(Date.now() + 100).toISOString();
const expired = sched2.expireAllocations(future);
assert.equal(expired, 1);
assert.equal(sched2.getAllocation(shortAlloc!.id)!.status, 'expired');
assert.equal(sched2.getPool(pool2.id)!.availableCapacity, 5);
passed++;
console.log('✓ expireAllocations: expires and returns capacity');

// --- Preemption history ---
const preemptions = sched.getPreemptions();
assert.ok(preemptions.length >= 1);
passed++;
console.log('✓ getPreemptions: returns history');

console.log(`\n✅ All ${passed} DRS smoke tests passed`);
