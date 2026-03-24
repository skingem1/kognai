/**
 * DRS — Dynamic Resource Scheduling
 * Public API surface
 * @version 0.2.0
 */

// Types
export type {
  AgentId,
  Timestamp,
  ResourcePoolId,
  ResourcePool,
  AllocationRequest,
  Allocation,
  PreemptionEvent,
} from './types.js';

// Scheduler
export {
  ResourceScheduler,
  defaultScheduler,
} from './scheduler.js';

/** Protocol version constant */
export const DRS_VERSION = '0.2' as const;
