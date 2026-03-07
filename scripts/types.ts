/**
 * Kognai Task Router Types
 * 
 * Defines the core type definitions for the task routing system,
 * including task targets, timeout budgets, route configurations,
 * and routing log entries.
 */

/**
 * Task execution target environments
 */
export type TaskTarget = 'local' | 'cloud-code' | 'cloud-exec' | 'cloud-post';

/**
 * Timeout budgets in milliseconds for each task target
 * - local: 10 minutes (600000ms) - local Ollama execution
 * - cloud-code: 2 minutes (120000ms) - cloud code generation
 * - cloud-exec: 90 seconds (90000ms) - cloud code execution
 * - cloud-post: 30 seconds (30000ms) - cloud post-processing
 */
export const TIMEOUT_BUDGETS: Record<TaskTarget, number> = {
  local: 600000,
  'cloud-code': 120000,
  'cloud-exec': 90000,
  'cloud-post': 30000,
} as const;

/**
 * Supported AI model providers
 */
export type ModelProvider = 'ollama' | 'minimax' | 'anthropic' | 'external';

/**
 * Task route configuration
 * Defines how a task should be routed to a specific provider and model
 */
export interface TaskRoute {
  /** The AI provider to use for this route */
  provider: ModelProvider;
  /** The specific model identifier */
  model: string;
  /** The endpoint URL for the provider */
  endpoint: string;
  /** Timeout in milliseconds for this route */
  timeoutMs: number;
  /** The target environment for task execution */
  target: TaskTarget;
}

/**
 * Routing log entry
 * Records the routing decision and execution details for audit and debugging
 */
export interface RoutingLogEntry {
  /** Unique execution identifier */
  execution_id: string;
  /** Sprint identifier this task belongs to */
  sprint_id: string;
  /** Task identifier within the sprint */
  task_id: string;
  /** Selected task target environment */
  task_target: TaskTarget;
  /** Provider used for execution */
  provider: string;
  /** Model used for execution */
  model: string;
  /** Timestamp when task was queued */
  queued_at: string;
  /** Timestamp when task started execution (optional) */
  executed_at?: string;
  /** Source of the execution request */
  execution_source: string;
  /** Whether the vault was reachable at routing time */
  vault_reachable?: boolean;
  /** Whether task was queued locally */
  queued_local?: boolean;
  /** Error message if routing or execution failed */
  error?: string;
}

/**
 * Type guard to check if a string is a valid TaskTarget
 */
export function isValidTaskTarget(value: string): value is TaskTarget {
  return ['local', 'cloud-code', 'cloud-exec', 'cloud-post'].includes(value);
}

/**
 * Get timeout budget for a task target
 * @param target - The task target environment
 * @returns Timeout in milliseconds, defaults to 60000ms if unknown
 */
export function getTimeoutBudget(target: TaskTarget): number {
  return TIMEOUT_BUDGETS[target] ?? 60000;
}