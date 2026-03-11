/**
 * byterover-client.ts — ByteRover context injection (Steps 0 + 7)
 *
 * ByteRover provides semantic memory for the swarm — query before a task to
 * inject relevant context, curate after to capture learnings.
 *
 * Graceful degradation: if `brv` is not installed, all calls are no-ops.
 * The pipeline NEVER fails because ByteRover is unavailable.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const BRV_TIMEOUT_MS = 30_000;

async function brvAvailable(): Promise<boolean> {
  try {
    await execFileAsync('which', ['brv'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Step 0: Query ByteRover for context relevant to this task objective.
 * Returns 300-500 token context string, or null if brv not installed.
 */
export async function brvQuery(taskObjective: string): Promise<string | null> {
  if (!(await brvAvailable())) return null;

  try {
    const { stdout } = await execFileAsync(
      'brv',
      ['query', taskObjective.slice(0, 500), '--headless', '--format', 'text'],
      { timeout: BRV_TIMEOUT_MS }
    );
    const result = stdout.trim();
    return result.length > 10 ? result : null;
  } catch (err: any) {
    // Non-fatal — pipeline continues without ByteRover context
    console.warn(`  [byterover] query failed (non-fatal): ${err.message?.slice(0, 80)}`);
    return null;
  }
}

/**
 * Step 7: Curate a completed task into ByteRover memory for future context.
 * Fire-and-forget — never blocks the pipeline.
 */
export async function brvCurate(taskTitle: string, filePaths: string[], outcome: string): Promise<void> {
  if (!(await brvAvailable())) return;

  const entry = `Task: ${taskTitle} | Files: ${filePaths.join(', ')} | Outcome: ${outcome.slice(0, 200)}`;

  try {
    await execFileAsync(
      'brv',
      ['curate', entry, '--headless'],
      { timeout: BRV_TIMEOUT_MS }
    );
  } catch (err: any) {
    console.warn(`  [byterover] curate failed (non-fatal): ${err.message?.slice(0, 80)}`);
  }
}
