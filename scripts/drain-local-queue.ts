import { drainLocalQueue, dequeueLocalTask, logRoutingDecision } from './task-router.js';
import { readFileSync } from 'fs';

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