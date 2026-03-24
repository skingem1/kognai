# DRS — Dynamic Resource Scheduling

> **v0.2.0** · Apache 2.0 · `@godman-protocols/drs` · Node 20+ / Deno 1.40+

DRS is an open protocol for allocating compute, memory, and model capacity across AI agent workloads — with resource pools, constraint-aware allocation, priority preemption, and automatic expiry.

```bash
npx skills add https://github.com/godman-protocols/drs
# or
npm install @godman-protocols/drs
```

---

## The Problem

Multi-agent systems compete for limited resources: GPU time, model inference slots, memory. Without a scheduling protocol:

- **Resource starvation** — low-priority agents hog capacity while critical tasks wait
- **No cost control** — agents allocate freely with no budget awareness
- **No reclamation** — allocated resources are never released, causing drift

DRS is the missing resource layer: define pools, allocate with constraints, preempt by priority, and auto-expire stale allocations.

---

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **ResourcePool** | A named collection of capacity units (e.g. GPU slots, model tokens, memory) |
| **AllocationRequest** | A request for capacity with priority, latency, and cost constraints |
| **Allocation** | A granted slice of a pool, bound to an agent with an expiry time |
| **PreemptionEvent** | A record of one allocation being reclaimed for a higher-priority request |
| **ResourceScheduler** | The central engine managing pools, allocations, and preemptions |

---

## Quickstart

```typescript
import { ResourceScheduler } from '@godman-protocols/drs';

const scheduler = new ResourceScheduler();

// 1. Register resource pools
const gpuPool = scheduler.addPool({
  name: 'Mac Mini M4 GPU',
  resourceType: 'gpu-m4',
  totalCapacity: 10,
  availableCapacity: 10,
  costPerUnit: 0.01,
  latencyMs: 45,
});

// 2. Allocate resources with constraints
const alloc = scheduler.allocate({
  id: 'req-001',
  requestingAgent: 'did:kognai:messi',
  poolId: gpuPool.id,
  unitsRequested: 3,
  priority: 'medium',
  maxLatencyMs: 100,
  maxCostUsdc: 0.10,
  requestedAt: new Date().toISOString(),
}, 60_000); // 60s duration
// → { unitsAllocated: 3, costUsdc: 0.03, status: 'active' }

// 3. Release when done
scheduler.release(alloc!.id);

// 4. Priority preemption — critical task takes over
const lowAlloc = scheduler.allocate({
  id: 'req-low', requestingAgent: 'did:kognai:sherlock', poolId: gpuPool.id,
  unitsRequested: 5, priority: 'low', maxLatencyMs: 100, maxCostUsdc: 0.10,
  requestedAt: new Date().toISOString(),
});

const preempt = scheduler.preempt(lowAlloc!.id, {
  id: 'req-critical', requestingAgent: 'did:kognai:harvey', poolId: gpuPool.id,
  unitsRequested: 5, priority: 'critical', maxLatencyMs: 100, maxCostUsdc: 0.10,
  requestedAt: new Date().toISOString(),
});
// → { preemption: { preemptedAgent: 'sherlock', ... }, allocation: { agentId: 'harvey', ... } }

// 5. Auto-expire stale allocations
const expiredCount = scheduler.expireAllocations();
```

---

## API Summary

### ResourceScheduler (`src/scheduler.ts`)

| Method | Description |
|--------|-------------|
| `addPool(pool)` | Register a resource pool |
| `getPool(poolId)` | Get pool by ID |
| `listPools()` | List all pools |
| `allocate(request, durationMs?)` | Allocate from a pool (checks capacity, latency, cost) |
| `release(allocationId)` | Release an allocation, return capacity to pool |
| `preempt(targetId, request)` | Preempt a lower-priority allocation |
| `expireAllocations(asOf?)` | Expire all past-due allocations |
| `getAllocation(id)` | Get allocation by ID |
| `getPreemptions()` | List all preemption events |

### Singleton

| Export | Description |
|--------|-------------|
| `defaultScheduler` | Pre-created singleton ResourceScheduler |

---

## Allocation Constraints

Every allocation request includes three constraints:

| Constraint | What it checks |
|------------|---------------|
| **Capacity** | `pool.availableCapacity >= request.unitsRequested` |
| **Latency** | `pool.latencyMs <= request.maxLatencyMs` |
| **Cost** | `unitsRequested × pool.costPerUnit <= request.maxCostUsdc` |

If any constraint fails, `allocate()` returns `null`.

---

## Preemption Rules

Preemption requires the preempting request to have **high** or **critical** priority. Priority ranks:

| Priority | Rank | Can preempt? |
|----------|------|-------------|
| `critical` | 4 | Yes |
| `high` | 3 | Yes |
| `medium` | 2 | No |
| `low` | 1 | No |

When preemption succeeds: the target allocation is marked `preempted`, capacity returns to the pool, and the preempting request gets a new allocation.

---

## Compatibility

| System | How it connects |
|--------|----------------|
| **Kognai** (5-tier router) | DRS pools map to router tiers: Nano (qwen3:0.6b) → Power (qwen3:14b) → Cloud (claude) |
| **LAX** (latency budgets) | LAX routes tasks; DRS allocates the capacity for execution |
| **PACT** (mandates) | Mandate `maxPaymentUsdc` maps to DRS allocation cost constraints |
| **SIGNAL** (events) | Allocation/release/preemption published as `resource.*` events |

---

## Related Protocols

| Protocol | Purpose |
|----------|---------|
| **PACT** | Agent coordination and trust |
| **LAX** | Latency-aware execution scheduling |
| **SCORE** | Scoring and reputation for agent outputs |
| **AMF** | Agent Message Format |
| **DRS** (this repo) | Dynamic Resource Scheduling |
| **SOUL** | Constitutional constraints and safety |
| **SIGNAL** | Event bus and pub/sub for agent swarms |

---

## Roadmap

- [x] Resource pool management (v0.2)
- [x] Constraint-aware allocation (capacity, latency, cost) (v0.2)
- [x] Priority-based preemption (v0.2)
- [x] Automatic allocation expiry (v0.2)
- [ ] Fair-share scheduling across agents (v0.3)
- [ ] Persistent pool state (Supabase / SQLite) (v0.3)
- [ ] Auto-scaling pool capacity (v0.4)
- [ ] Python SDK (v0.5)
- [ ] x402 payment-gated premium pools (v0.5)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE)

Part of the [Godman Protocols](https://github.com/godman-protocols) portfolio.
