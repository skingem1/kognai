// Sprint 681: Fix MODULE_NOT_FOUND — use require() for CommonJS/ts-node compatibility
const { drainLocalQueue, dequeueLocalTask, logRoutingDecision } = require('./task-router');
import { readFileSync } from 'fs';

async function main() {
  const filePaths = await drainLocalQueue();

  for (const filePath of filePaths) {
    const task = JSON.parse(readFileSync(filePath, 'utf-8'));
    const executionId = task.execution_id;

    console.log(`Draining: ${executionId}`);
    await dequeueLocalTask(executionId);

    await logRoutingDecision({
      execution_id: executionId,
      executed_at: new Date().toISOString(),
      execution_source: 'pending-local-drain'
    });
  }

  console.log(`Drained ${filePaths.length} local task(s)`);
}

main().catch(err => { console.error('[drain] Error:', err.message); process.exit(1); });