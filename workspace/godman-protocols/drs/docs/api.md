# DRS — API Reference

> `@godman-protocols/drs` · v0.2.0

---

## Class: `ResourceScheduler`

Stateful scheduler that manages resource pools, allocations, and preemption.

```typescript
import { ResourceScheduler } from '@godman-protocols/drs';
const scheduler = new ResourceScheduler();
```

A pre-constructed singleton is also exported:

```typescript
import { defaultScheduler } from '@godman-protocols/drs';
```

---

### `scheduler.addPool(pool): ResourcePool`

Register a new resource pool.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `pool.name` | `string` | Human-readable pool name |
| `pool.resourceType` | `string` | Model or compute type (e.g. `'qwen3:14b'`, `'claude-sonnet-4-6'`, `'gpu-a100'`) |
| `pool.totalCapacity` | `number` | Total capacity units |
| `pool.availableCapacity` | `number` | Initially available units (usually equals `totalCapacity`) |
| `pool.costPerUnit` | `number` | USDC cost per capacity unit |
| `pool.latencyMs` | `number` | Average observed latency in milliseconds |
| `pool.id` | `string?` | Override the auto-generated UUID |

**Returns:** `ResourcePool` — the registered pool with `id` set.

---

### `scheduler.getPool(poolId): ResourcePool | undefined`

Retrieve a pool by ID. Returns `undefined` if not found.

---

### `scheduler.listPools(): ResourcePool[]`

List all registered pools.

---

### `scheduler.allocate(request, durationMs?): Allocation | null`

Request capacity allocation from a pool.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `request.id` | `string` | Unique request ID |
| `request.requestingAgent` | `AgentId` | Identity of the requesting agent |
| `request.poolId` | `ResourcePoolId` | Target pool |
| `request.unitsRequested` | `number` | Capacity units needed |
| `request.priority` | `'critical' \| 'high' \| 'medium' \| 'low'` | Request priority |
| `request.maxLatencyMs` | `number` | Maximum acceptable pool latency |
| `request.maxCostUsdc` | `number` | Maximum acceptable cost (units × costPerUnit) |
| `request.requestedAt` | `Timestamp` | ISO 8601 request time |
| `request.deadline` | `Timestamp?` | Optional task deadline |
| `durationMs` | `number?` | Allocation TTL in ms. Default: `300_000` (5 minutes) |

**Returns:** `Allocation` if granted, `null` if any constraint fails:
- Pool not found
- Insufficient `availableCapacity`
- `pool.latencyMs > request.maxLatencyMs`
- Computed cost exceeds `request.maxCostUsdc`

**Side effect:** Decrements `pool.availableCapacity` by `unitsRequested`.

---

### `scheduler.release(allocationId): boolean`

Release an active allocation, returning capacity to the pool.

**Returns:** `true` if released, `false` if the allocation was not found or not `'active'`.

**Side effect:** Sets `allocation.status = 'released'`, increments `pool.availableCapacity`.

---

### `scheduler.preempt(targetAllocationId, preemptingRequest): { preemption, allocation } | null`

Forcibly preempt an active allocation with a higher-priority request.

**Requirements:**
- Target allocation must be `'active'`
- Preempting request priority must be `'high'` or `'critical'`

**Returns:** `{ preemption: PreemptionEvent, allocation: Allocation }` on success, `null` if:
- Target not found or not active
- Preempting priority is below `'high'`
- New allocation fails (e.g. pool has no capacity after preemption)

**Side effects:** Sets target `status = 'preempted'`, reclaims capacity, allocates for preempting request, appends `PreemptionEvent`.

---

### `scheduler.expireAllocations(asOf?): number`

Mark all active allocations past their `expiresAt` as `'expired'` and reclaim capacity.

| Name | Type | Description |
|------|------|-------------|
| `asOf` | `Timestamp?` | Reference time. Defaults to `new Date().toISOString()` |

**Returns:** Number of allocations expired.

**Usage:** Call periodically (e.g. every 60 seconds) to prevent capacity leaks.

---

### `scheduler.getAllocation(id): Allocation | undefined`

Retrieve an allocation by ID.

---

### `scheduler.getPreemptions(): ReadonlyArray<PreemptionEvent>`

Return all preemption events (append-only log).

---

## Types

### `ResourcePool`

```typescript
interface ResourcePool {
  id: ResourcePoolId;        // UUID
  name: string;              // Human-readable
  resourceType: string;      // 'qwen3:14b', 'claude-sonnet-4-6', 'gpu-a100', etc.
  totalCapacity: number;     // Total units — never changes after registration
  availableCapacity: number; // Currently available — mutated by allocate/release/expire
  costPerUnit: number;       // USDC per unit
  latencyMs: number;         // Average latency (ms) — used for constraint checks
}
```

### `AllocationRequest`

```typescript
interface AllocationRequest {
  id: string;
  requestingAgent: AgentId;
  poolId: ResourcePoolId;
  unitsRequested: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  maxLatencyMs: number;
  maxCostUsdc: number;
  requestedAt: Timestamp;
  deadline?: Timestamp;
}
```

### `Allocation`

```typescript
interface Allocation {
  id: string;
  requestId: string;         // Back-reference to AllocationRequest.id
  agentId: AgentId;
  poolId: ResourcePoolId;
  unitsAllocated: number;
  costUsdc: number;          // Actual cost charged
  allocatedAt: Timestamp;
  expiresAt: Timestamp;      // allocatedAt + durationMs
  status: 'active' | 'released' | 'preempted' | 'expired';
}
```

### `PreemptionEvent`

```typescript
interface PreemptionEvent {
  allocationId: string;      // The preempted allocation
  preemptedAgent: AgentId;
  preemptingAgent: AgentId;
  reason: string;            // e.g. 'Priority preemption: critical'
  timestamp: Timestamp;
}
```

---

## Constants

| Name | Value |
|------|-------|
| `DRS_VERSION` | `'0.2'` |
| `defaultScheduler` | `new ResourceScheduler()` — singleton instance |
