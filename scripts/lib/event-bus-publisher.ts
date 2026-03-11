import * as https from 'https';
import { KognaiEvent } from './event-bus-types';

// Config — reads from process.env; graceful no-op if missing
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
let _warnedMissing = false;

function checkConfig(): boolean {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    if (!_warnedMissing) {
      process.stderr.write('[event-bus] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — events will be dropped\n');
      _warnedMissing = true;
    }
    return false;
  }
  return true;
}

export async function publishEvent(event: KognaiEvent): Promise<void> {
  if (!checkConfig()) return;
  return new Promise((resolve) => {
    const body = JSON.stringify(event);
    const url = new URL(`${SUPABASE_URL}/rest/v1/kognai_events`);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 5000,
    }, () => resolve());
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

export function publishTaskStarted(agentId: string, sprint: string, taskId: string, title: string): Promise<void> {
  return publishEvent({
    event_type: 'task.started',
    agent_id: agentId,
    sprint,
    timestamp: new Date().toISOString(),
    payload: { task_id: taskId, title, status: 'started' },
  });
}

export function publishTaskCompleted(agentId: string, sprint: string, taskId: string, title: string, costUsdc: number): Promise<void> {
  return publishEvent({
    event_type: 'task.completed',
    agent_id: agentId,
    sprint,
    timestamp: new Date().toISOString(),
    payload: { task_id: taskId, title, status: 'completed', costUsdc },
  });
}

export function publishTaskFailed(agentId: string, sprint: string, taskId: string, title: string, reason: string): Promise<void> {
  return publishEvent({
    event_type: 'task.failed',
    agent_id: agentId,
    sprint,
    timestamp: new Date().toISOString(),
    payload: { task_id: taskId, title, status: 'failed', reason },
  });
}

export function publishBudgetWarning(sprint: string, burnPct: number, spentUsdc: number, budgetUsdc: number): Promise<void> {
  return publishEvent({
    event_type: 'interrupt.budget.warning',
    agent_id: 'bloomberg',
    sprint,
    timestamp: new Date().toISOString(),
    payload: { burnPct, spentUsdc, budgetUsdc },
  });
}

export function publishBudgetFreeze(sprint: string, burnPct: number): Promise<void> {
  return publishEvent({
    event_type: 'interrupt.budget.freeze',
    agent_id: 'bloomberg',
    sprint,
    timestamp: new Date().toISOString(),
    payload: { burnPct, spentUsdc: 0, budgetUsdc: 0 },
  });
}

export function publishSprintStarted(sprint: string, taskCount: number): Promise<void> {
  return publishEvent({
    event_type: 'system.sprint.started',
    agent_id: 'orchestrator',
    sprint,
    timestamp: new Date().toISOString(),
    payload: { sprint, taskCount, completedCount: 0 },
  });
}

export function publishSprintCompleted(sprint: string, taskCount: number, completedCount: number): Promise<void> {
  return publishEvent({
    event_type: 'system.sprint.completed',
    agent_id: 'orchestrator',
    sprint,
    timestamp: new Date().toISOString(),
    payload: { sprint, taskCount, completedCount },
  });
}
