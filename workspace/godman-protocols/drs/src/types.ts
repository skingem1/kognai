/**
 * DRS — Dynamic Resource Scheduling
 * Core type definitions (skeleton)
 * @version 0.1.0-skeleton
 */

export type AgentId = string;
export type Timestamp = string;
export type ResourcePoolId = string;

export interface ResourcePool {
  id: ResourcePoolId;
  name: string;
  /** Model or compute type (e.g. 'qwen3:14b', 'claude-sonnet-4-6', 'gpu-a100') */
  resourceType: string;
  /** Total capacity units */
  totalCapacity: number;
  /** Currently available capacity units */
  availableCapacity: number;
  /** Cost per capacity unit in USDC */
  costPerUnit: number;
  /** Average observed latency in milliseconds */
  latencyMs: number;
}

export interface AllocationRequest {
  id: string;
  requestingAgent: AgentId;
  poolId: ResourcePoolId;
  /** Capacity units requested */
  unitsRequested: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Max latency acceptable in milliseconds */
  maxLatencyMs: number;
  /** Max cost in USDC */
  maxCostUsdc: number;
  requestedAt: Timestamp;
  /** ISO 8601 — when the task must complete */
  deadline?: Timestamp;
}

export interface Allocation {
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

export interface PreemptionEvent {
  allocationId: string;
  preemptedAgent: AgentId;
  preemptingAgent: AgentId;
  reason: string;
  timestamp: Timestamp;
}
