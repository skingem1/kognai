// Kognai Task Router — Sprint-063
// Barrel export + logRoutingDecision utility
// DO NOT let linters revert this file — it must re-export from ./router/* subdir

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export {
  TaskTarget,
  TIMEOUT_BUDGETS,
  TaskRoute,
  RoutingLogEntry,
} from './types';

// Re-export from router/ subdirectory (NOT flat siblings)
export { resolveRoute } from './router/resolve-route';
export { generateExecutionId } from './router/generate-execution-id';

import type { TaskTarget, TaskRoute, RoutingLogEntry } from './types';
import { resolveRoute } from './router/resolve-route';

/**
 * Write a routing decision line to logs/routing/YYYY-MM-DD.jsonl
 * and a compact idempotency line to logs/routing/executed.jsonl.
 * Non-fatal: all errors are silently swallowed so routing logs never block execution.
 */
export function logRoutingDecision(entry: RoutingLogEntry): void {
  try {
    const logDir = join(process.cwd(), 'logs', 'routing');
    mkdirSync(logDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const logged_at = new Date().toISOString();
    const fullLine = JSON.stringify({ ...entry, logged_at });
    const idempLine = JSON.stringify({
      execution_id: entry.execution_id,
      task_id: entry.task_id,
      sprint_id: entry.sprint_id,
      logged_at,
    });
    appendFileSync(join(logDir, `${today}.jsonl`), fullLine + '\n', 'utf-8');
    appendFileSync(join(logDir, 'executed.jsonl'), idempLine + '\n', 'utf-8');
  } catch {
    // non-fatal — routing log must never block execution
  }
}

/**
 * Primary entry point: resolves a route for the given task target.
 *
 * @param target - The task target ('local' | 'cloud-code' | 'cloud-exec' | 'cloud-post')
 * @returns The resolved route with provider, model, endpoint, and timeout
 */
export function getTaskRoute(target: TaskTarget): TaskRoute {
  return resolveRoute(target);
}
