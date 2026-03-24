/**
 * LAX — Latency-Aware Execution
 * Public API surface (skeleton)
 * @version 0.1.0-skeleton
 *
 * Implementation stubs only. Real logic TBD in v0.2+.
 */

export type {
  AgentId,
  Timestamp,
  DurationMs,
  LatencyBudget,
  ExecutionSlot,
  SLAContract,
  RoutingDecision,
  LatencyProbe,
} from './types.js';

/** Protocol version constant */
export const LAX_VERSION = '0.1' as const;

/**
 * Create a LatencyBudget for a task.
 */
export function createBudget(
  _maxLatencyMs: number,
  _targetLatencyMs: number,
  _hardLimit?: boolean,
): import('./types.js').LatencyBudget {
  throw new Error('LAX createBudget: not implemented — skeleton phase');
}

/**
 * Probe a runtime endpoint and return latency measurement.
 */
export function probeRuntime(
  _runtimeId: string,
): import('./types.js').LatencyProbe {
  throw new Error('LAX probeRuntime: not implemented — skeleton phase');
}

/**
 * Route a task to the best available runtime given a LatencyBudget.
 */
export function routeTask(
  _taskId: string,
  _agent: string,
  _budget: import('./types.js').LatencyBudget,
  _slots: import('./types.js').ExecutionSlot[],
): import('./types.js').RoutingDecision {
  throw new Error('LAX routeTask: not implemented — skeleton phase');
}

/**
 * Register an SLA contract between an agent and a runtime.
 */
export function registerSLA(
  _agent: string,
  _runtimeId: string,
  _maxLatencyMs: number,
  _minThroughputRps: number,
): import('./types.js').SLAContract {
  throw new Error('LAX registerSLA: not implemented — skeleton phase');
}
