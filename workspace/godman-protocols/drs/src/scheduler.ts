/**
 * DRS — Dynamic Resource Scheduling
 * ResourceScheduler: pool management, allocation, release, preemption
 * @version 0.2.0
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  Allocation,
  AllocationRequest,
  PreemptionEvent,
  ResourcePool,
  ResourcePoolId,
  Timestamp,
} from './types.js';

// ---------------------------------------------------------------------------
// Priority ordering (for preemption)
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

// ---------------------------------------------------------------------------
// ResourceScheduler
// ---------------------------------------------------------------------------

export class ResourceScheduler {
  private pools = new Map<ResourcePoolId, ResourcePool>();
  private allocations = new Map<string, Allocation>();
  private preemptions: PreemptionEvent[] = [];

  /**
   * Register a resource pool.
   */
  addPool(pool: Omit<ResourcePool, 'id'> & { id?: string }): ResourcePool {
    const full: ResourcePool = { ...pool, id: pool.id ?? randomUUID() };
    this.pools.set(full.id, full);
    return full;
  }

  /**
   * Get a pool by ID.
   */
  getPool(poolId: ResourcePoolId): ResourcePool | undefined {
    return this.pools.get(poolId);
  }

  /**
   * List all pools.
   */
  listPools(): ResourcePool[] {
    return [...this.pools.values()];
  }

  /**
   * Request allocation from a pool.
   * Checks: capacity, latency, cost constraints.
   * Returns null if constraints can't be met.
   */
  allocate(request: AllocationRequest, durationMs = 300_000): Allocation | null {
    const pool = this.pools.get(request.poolId);
    if (!pool) return null;

    // Check capacity
    if (pool.availableCapacity < request.unitsRequested) return null;

    // Check latency
    if (pool.latencyMs > request.maxLatencyMs) return null;

    // Check cost
    const cost = request.unitsRequested * pool.costPerUnit;
    if (cost > request.maxCostUsdc) return null;

    // Allocate
    pool.availableCapacity -= request.unitsRequested;
    const now = new Date();
    const allocation: Allocation = {
      id: randomUUID(),
      requestId: request.id,
      agentId: request.requestingAgent,
      poolId: request.poolId,
      unitsAllocated: request.unitsRequested,
      costUsdc: cost,
      allocatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + durationMs).toISOString(),
      status: 'active',
    };
    this.allocations.set(allocation.id, allocation);
    return allocation;
  }

  /**
   * Release an allocation, returning capacity to the pool.
   */
  release(allocationId: string): boolean {
    const alloc = this.allocations.get(allocationId);
    if (!alloc || alloc.status !== 'active') return false;
    alloc.status = 'released';
    const pool = this.pools.get(alloc.poolId);
    if (pool) pool.availableCapacity += alloc.unitsAllocated;
    return true;
  }

  /**
   * Preempt an allocation if the preempting request has higher priority.
   * Returns the preemption event, or null if preemption not allowed.
   */
  preempt(
    targetAllocationId: string,
    preemptingRequest: AllocationRequest
  ): { preemption: PreemptionEvent; allocation: Allocation } | null {
    const target = this.allocations.get(targetAllocationId);
    if (!target || target.status !== 'active') return null;

    // Find original request priority (approximate from allocation context)
    // For simplicity, preempt if requesting priority is strictly higher
    const preemptingRank = PRIORITY_RANK[preemptingRequest.priority] ?? 0;
    // We don't store original priority, so preemption requires 'critical' or 'high'
    if (preemptingRank < 3) return null; // must be high or critical

    // Release the target allocation
    target.status = 'preempted';
    const pool = this.pools.get(target.poolId);
    if (pool) pool.availableCapacity += target.unitsAllocated;

    const preemption: PreemptionEvent = {
      allocationId: targetAllocationId,
      preemptedAgent: target.agentId,
      preemptingAgent: preemptingRequest.requestingAgent,
      reason: `Priority preemption: ${preemptingRequest.priority}`,
      timestamp: new Date().toISOString(),
    };
    this.preemptions.push(preemption);

    // Allocate for the preempting request
    const newAlloc = this.allocate(preemptingRequest);
    if (!newAlloc) return null;

    return { preemption, allocation: newAlloc };
  }

  /**
   * Expire allocations past their expiry time.
   */
  expireAllocations(asOf?: Timestamp): number {
    const now = new Date(asOf ?? new Date().toISOString()).getTime();
    let expired = 0;
    for (const alloc of this.allocations.values()) {
      if (alloc.status !== 'active') continue;
      if (new Date(alloc.expiresAt).getTime() <= now) {
        alloc.status = 'expired';
        const pool = this.pools.get(alloc.poolId);
        if (pool) pool.availableCapacity += alloc.unitsAllocated;
        expired++;
      }
    }
    return expired;
  }

  /**
   * Get an allocation by ID.
   */
  getAllocation(id: string): Allocation | undefined {
    return this.allocations.get(id);
  }

  /**
   * List all preemption events.
   */
  getPreemptions(): ReadonlyArray<PreemptionEvent> {
    return [...this.preemptions];
  }
}

/** Default singleton scheduler */
export const defaultScheduler = new ResourceScheduler();
