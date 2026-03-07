// Kognai Task Router - Barrel Export
// Provides unified access to routing logic, types, and utilities

export {
  TaskTarget,
  TIMEOUT_BUDGETS,
  TaskRoute,
  RoutingLogEntry,
} from './types';

export { resolveRoute } from './resolve-route';

export { generateExecutionId } from './generate-execution-id';

/**
 * Convenience function that resolves a route for the given task target.
 * This is the primary entry point for routing tasks to appropriate models.
 * 
 * @param target - The task target containing complexity and cost constraints
 * @returns The resolved route with model selection and timeout budget
 */
export function getTaskRoute(target: TaskTarget): TaskRoute {
  return resolveRoute(target);
}