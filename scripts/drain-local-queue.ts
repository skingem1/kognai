// Sprint 686: Fix — drainLocalQueue/dequeueLocalTask never existed in task-router.
// Implement as self-contained: scan pending-local dir, process tasks, log routing.
import { readdirSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { logRoutingDecision } from './task-router';

const ROOT = process.cwd();
const PENDING_DIR = join(ROOT, 'data', 'pending-local');

async function main() {
  // Ensure dir exists; if empty or missing, exit silently (normal state)
  if (!existsSync(PENDING_DIR)) {
    mkdirSync(PENDING_DIR, { recursive: true });
    console.log('[drain] No pending tasks (dir created)');
    return;
  }

  const files = readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('[drain] No pending tasks');
    return;
  }

  let processed = 0;
  for (const file of files) {
    const filePath = join(PENDING_DIR, file);
    try {
      const task = JSON.parse(readFileSync(filePath, 'utf-8'));
      const executionId = task.execution_id || file.replace('.json', '');

      console.log(`[drain] Processing: ${executionId}`);

      logRoutingDecision({
        execution_id: executionId,
        executed_at: new Date().toISOString(),
        execution_source: 'pending-local-drain',
      } as any);

      // Remove processed task file
      unlinkSync(filePath);
      processed++;
    } catch (err: any) {
      console.error(`[drain] Failed to process ${file}: ${err.message}`);
    }
  }

  console.log(`[drain] Drained ${processed}/${files.length} local task(s)`);
}

main().catch(err => { console.error('[drain] Error:', err.message); process.exit(1); });
