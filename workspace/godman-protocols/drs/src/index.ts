/**
 * DRS — Dynamic Resource Scheduling
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 */

export type {
  AgentId, Timestamp, ResourcePoolId,
  ResourcePool, AllocationRequest, Allocation, PreemptionEvent,
} from './types.js';

export const DRS_VERSION = '0.1' as const;

export function requestAllocation(
  _request: import('./types.js').AllocationRequest,
): import('./types.js').Allocation {
  throw new Error('DRS requestAllocation: not implemented — skeleton phase');
}

export function releaseAllocation(_allocationId: string): void {
  throw new Error('DRS releaseAllocation: not implemented — skeleton phase');
}

export function listPools(): import('./types.js').ResourcePool[] {
  throw new Error('DRS listPools: not implemented — skeleton phase');
}
