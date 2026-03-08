/**
 * sprint-runner.ts — Auto-executes pending sprint tasks via dual-supervisor orchestrator
 *
 * PM2 cron: every 30 minutes — checks for pending work and runs it
 *
 * Flow:
 *   1. Check lock file (prevents parallel sprints)
 *   2. Scan sprints/ for JSON files with pending tasks
 *      Priority: week-N.json descending (newest sprint first)
 *   3. Read sprint JSON, inject sprint_id into each task
 *   4. Write modified sprint to logs/sprint-runner-active.json
 *   5. Spawn orchestrate-agents-v2.ts on the temp ACTIVE file
 *      (Dual supervisor: Claude Sonnet + OpenAI Codex, CEO conflict resolution)
 *   6. Telegram alert on start + finish
 *   7. Release lock when done
 *
 * GitHub Issues → Sprint Tasks:
 *   CEO creates GitHub issues as directives. To execute them, they must be
 *   converted into a sprint JSON file (sprints/week-N.json) first.
 *   The CEO bot or a human writes the sprint JSON; this runner executes it.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';
import 'dotenv/config';

// ── Config ─────────────────────────────────────────────────────────────────
const ROOT       = process.cwd();
const SPRINTS    = existsSync(join(ROOT, 'workspace', 'sprints')) ? join(ROOT, 'workspace', 'sprints') : join(ROOT, 'sprints');
const LOCK       = join(ROOT, 'logs', 'sprint-runner.lock');
const LOG        = join(ROOT, 'logs', 'sprint-runner.log');
const ACTIVE     = join(ROOT, 'logs', 'sprint-runner-active.json');
const MAX_HOURS  = 6; // kill orchestrator if it runs longer than this

interface Task { id: string; status: string; agent?: string; sprint_id?: string; [k: string]: unknown; }
interface Sprint { sprint_id: string; tasks: Task[]; [k: string]: unknown; }

// ── Logging ─────────────────────────────────────────────────────────────────
function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +00:00';
}
function log(msg: string): void {
  const line = `${ts()}: [SprintRunner] ${msg}`;
  console.log(line);
  try {
    const prev = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
    writeFileSync(LOG, prev + line + '\n');
  } catch { /* non-fatal */ }
}

// ── Telegram ────────────────────────────────────────────────────────────────
function sendTelegram(text: string): void {
  const token   = process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId  = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  const req  = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  });
  req.on('error', () => { /* silent */ });
  req.write(body);
  req.end();
}

// ── Lock ────────────────────────────────────────────────────────────────────
function isLocked(): boolean {
  if (!existsSync(LOCK)) return false;
  try {
    const pid = parseInt(readFileSync(LOCK, 'utf8').trim(), 10);
    process.kill(pid, 0); // throws if PID not running
    return true;
  } catch {
    // stale lock
    try { unlinkSync(LOCK); } catch { /* ignore */ }
    return false;
  }
}

function acquireLock(): void {
  writeFileSync(LOCK, String(process.pid));
}
function releaseLock(): void {
  try { unlinkSync(LOCK); } catch { /* ignore */ }
}

// ── Sprint ID Injection ────────────────────────────────────────────────────
function deriveSprintIdFromFilename(filename: string): string {
  // Extract sprint-NNN from path like sprints/sprint-064.json or sprints/sprint-064
  const base = basename(filename, '.json');
  // If it already matches sprint-NNN pattern, use it
  if (/^sprint-\d+$/.test(base)) {
    return base;
  }
  // Fallback: use the base name as-is
  return base;
}

function injectSprintIdIntoTasks(sprint: Sprint, sprintFilePath: string): Sprint {
  // Determine sprint_id: use explicit field, or derive from filename
  const sprintId = sprint.sprint_id || deriveSprintIdFromFilename(sprintFilePath);
  
  // Inject sprint_id into each task
  if (sprint.tasks && Array.isArray(sprint.tasks)) {
    for (const task of sprint.tasks) {
      task.sprint_id = sprintId;
    }
  }
  
  return sprint;
}

// ── Schema Normalizer (S66-002) ──────────────────────────────────────────────
// Maps CEO-authored sprint schema → orchestrator schema
function normalizeTasks(tasks: any[]): any[] {
  return tasks.map((task: any) => ({
    ...task,
    context:      task.context      ?? task.description ?? '',
    dependencies: task.dependencies ?? task.depends_on  ?? [],
    deliverables: task.deliverables ?? (task.file ? { code: [task.file] } : { code: [] }),
    agent:        task.agent        ?? 'coder',
    type:         task.type         ?? 'feature',
    priority:     task.priority     ?? 'medium',
    status:       task.status       ?? 'pending',
  }));
}

function writeActiveSprint(sprint: Sprint): string {
  // Ensure logs directory exists
  const logsDir = join(ROOT, 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  
  // Write the modified sprint to ACTIVE file
  writeFileSync(ACTIVE, JSON.stringify(sprint, null, 2), 'utf8');
  return ACTIVE;
}

// ── Main ────────────────────────────────────────────────────────────────────
function findPendingSprint(): string | null {
  if (!existsSync(SPRINTS)) return null;
  
  const files = readdirSync(SPRINTS)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  for (const file of files) {
    const path = join(SPRINTS, file);
    try {
      const content = readFileSync(path, 'utf8');
      const sprint: Sprint = JSON.parse(content);
      const hasPending = sprint.tasks?.some((t: Task) => t.status === 'pending');
      if (hasPending) return path;
    } catch {
      continue;
    }
  }
  return null;
}

function main(): void {
  if (isLocked()) {
    log('Lock present — another runner active. Exiting.');
    return;
  }

  acquireLock();
  log('Starting sprint runner...');

  const sprintPath = findPendingSprint();
  if (!sprintPath) {
    log('No pending sprints found.');
    releaseLock();
    return;
  }

  log(`Found pending sprint: ${sprintPath}`);

  // Read and parse the sprint JSON
  let sprint: Sprint;
  try {
    const content = readFileSync(sprintPath, 'utf8');
    sprint = JSON.parse(content);
  } catch (err) {
    log(`Failed to read sprint JSON: ${err}`);
    releaseLock();
    return;
  }

  // Inject sprint_id into each task
  const sprintWithIds = injectSprintIdIntoTasks(sprint, sprintPath);
  log(`Injected sprint_id into ${sprintWithIds.tasks?.length || 0} tasks`);

  // Normalize CEO schema → orchestrator schema (S66-002)
  sprintWithIds.tasks = normalizeTasks(sprintWithIds.tasks);
  log(`Normalized ${sprintWithIds.tasks.length} tasks (CEO schema → orchestrator schema)`);

  // Write modified sprint to ACTIVE file
  const activePath = writeActiveSprint(sprintWithIds);
  log(`Written modified sprint to: ${activePath}`);

  // Spawn orchestrate-agents-v2.ts with the ACTIVE file path
  const orchestratorPath = join(ROOT, 'scripts', 'orchestrate-agents-v2.ts');
  
  const start = Date.now();
  sendTelegram(`🚀 *Sprint Runner* started\\n\\nSprint: \`${basename(sprintPath)}\`\\nTasks: ${sprintWithIds.tasks?.length || 0}`);

  const result = spawnSync(
    'npx',
    ['ts-node', orchestratorPath, activePath],
    {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env },
      timeout: MAX_HOURS * 60 * 60 * 1000,
    }
  );

  const elapsed = Math.round((Date.now() - start) / 60000);
  const status = result.status === 0 ? '✅ Completed' : `❌ Failed (exit ${result.status})`;
  
  log(`Orchestrator finished: ${status} (${elapsed} min)`);
  sendTelegram(`🏁 *Sprint Runner* finished\\n\\n${status}\\nDuration: ${elapsed} min`);

  // Clean up ACTIVE file after run
  try {
    if (existsSync(ACTIVE)) {
      unlinkSync(ACTIVE);
      log('Cleaned up ACTIVE sprint file');
    }
  } catch {
    // non-fatal
  }

  releaseLock();
}

main();