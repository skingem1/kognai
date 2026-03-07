import { createHash } from 'crypto';

/**
 * Generates a deterministic execution ID from sprintId and taskId.
 * Uses SHA256 hash of `${sprintId}:${taskId}` to create a consistent identifier.
 *
 * @param sprintId - The unique identifier for the sprint
 * @param taskId - The unique identifier for the task
 * @returns A 64-character hexadecimal SHA256 hash string
 * @throws Error if sprintId or taskId is not provided
 */
export function generateExecutionId(sprintId: string, taskId: string): string {
  if (!sprintId || typeof sprintId !== 'string') {
    throw new Error('sprintId must be a non-empty string');
  }
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('taskId must be a non-empty string');
  }

  const input = `${sprintId}:${taskId}`;
  const hash = createHash('sha256').update(input).digest('hex');
  
  return hash;
}