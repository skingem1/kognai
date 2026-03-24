# DRS API Reference

> **v0.2.0** · Full API surface for `@godman-protocols/drs`

---

## Types

### `AgentId`
```typescript
type AgentId = string;
```

### `Timestamp`
```typescript
type Timestamp = string;
```
ISO 8601 timestamp string.

### `ResourcePoolId`
```typescript
type ResourcePoolId = string;
```

### `ResourcePool`
```typescript
interface ResourcePool {
  id: ResourcePoolId;
  name: string;
  resourceType: string;
  totalCapacity: number;
  availableCapacity: number;
  costPerUnit: number;
  latencyMs: number;
}
```
`resourceType` examples: `'qwen3:14b'`, `'claude-sonnet-4-6'`, `'gpu-a100'`. `costPerUnit` is in USDC.

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
  requestId: string;
  agentId: AgentId;
  poolId: ResourcePoolId;
  unitsAllocated: number;
  costUsdc: number;
  allocatedAt: Timestamp;
  expiresAt: Timestamp;
  status: 'active' | 'released' | 'preempted' | 'expired';
}
```

### `PreemptionEvent`
```typescript
interface PreemptionEvent {
  allocationId: string;
  preemptedAgent: AgentId;
  preemptingAgent: AgentId;
  reason: string;
  timestamp: Timestamp;
}
```

---

## ResourceScheduler (`src/scheduler.ts`)

### `class ResourceScheduler`

Central engine for pool management, allocation, release, preemption, and expiry.

### `addPool(pool)`

Register a resource pool.

| Param | Type | Description |
|-------|------|-------------|
| `pool` | `Omit<ResourcePool, 'id'> & { id?: string }` | Pool definition (ID auto-generated if omitted) |

**Returns:** `ResourcePool`

### `getPool(poolId)`

Get a pool by ID.

**Returns:** `ResourcePool | undefined`

### `listPools()`

List all registered pools.

**Returns:** `ResourcePool[]`

### `allocate(request, durationMs?)`

Request allocation from a pool.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `request` | `AllocationRequest` | — | Allocation request with constraints |
| `durationMs` | `number` | `300_000` (5 min) | Allocation duration before auto-expiry |

**Returns:** `Allocation | null`

Returns `null` if any constraint fails:
- `pool.availableCapacity < request.unitsRequested` — capacity exceeded
- `pool.latencyMs > request.maxLatencyMs` — latency too high
- `unitsRequested × pool.costPerUnit > request.maxCostUsdc` — cost exceeded
- Pool not found

### `release(allocationId)`

Release an allocation, returning capacity to the pool.

| Param | Type | Description |
|-------|------|-------------|
| `allocationId` | `string` | Allocation to release |

**Returns:** `boolean` — `true` if released, `false` if not found or not active

### `preempt(targetAllocationId, preemptingRequest)`

Preempt an allocation if the preempting request has higher priority.

| Param | Type | Description |
|-------|------|-------------|
| `targetAllocationId` | `string` | Allocation to preempt |
| `preemptingRequest` | `AllocationRequest` | The higher-priority request |

**Returns:** `{ preemption: PreemptionEvent; allocation: Allocation } | null`

Returns `null` if:
- Target allocation not found or not active
- Preempting request priority rank < 3 (must be `high` or `critical`)
- Reallocation fails after preemption

**Priority ranks:** critical=4, high=3, medium=2, low=1

### `expireAllocations(asOf?)`

Expire all allocations past their expiry time.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `asOf` | `Timestamp` | now | Check expiry relative to this timestamp |

**Returns:** `number` — count of expired allocations

### `getAllocation(id)`

Get an allocation by ID.

**Returns:** `Allocation | undefined`

### `getPreemptions()`

List all preemption events.

**Returns:** `ReadonlyArray<PreemptionEvent>`

### `defaultScheduler`

Pre-created singleton `ResourceScheduler` for single-process use.

```typescript
import { defaultScheduler } from '@godman-protocols/drs';
```

---

## Constants

```typescript
const DRS_VERSION: '0.2';
```
