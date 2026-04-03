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
const COOLDOWN   = join(ROOT, 'logs', 'sprint-runner-cooldown.json');
const MAX_HOURS  = 6; // kill orchestrator if it runs longer than this
// Rate limiter: minimum gap between sprint executions (prevents burning Claude 5h limit)
// Default: 30 min. Override via SPRINT_COOLDOWN_MINUTES env var.
const COOLDOWN_MINUTES    = parseInt(process.env.SPRINT_COOLDOWN_MINUTES  ?? '30',  10);
// Daily cap: max sprints per calendar day. Default: 100.
const DAILY_SPRINT_CAP    = parseInt(process.env.DAILY_SPRINT_CAP         ?? '100', 10);
// Rolling window cap: max sprints within the last N hours. Default: 20 per 5h.
const ROLLING_CAP         = parseInt(process.env.ROLLING_SPRINT_CAP       ?? '20',  10);
const ROLLING_WINDOW_HRS  = parseInt(process.env.ROLLING_WINDOW_HOURS     ?? '5',   10);

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

// ── Rate Limiter (Claude 5h token budget protection) ────────────────────────
function isInCooldown(): boolean {
  if (!existsSync(COOLDOWN)) return false;
  try {
    const { until } = JSON.parse(readFileSync(COOLDOWN, 'utf8'));
    if (Date.now() < until) {
      const remaining = Math.ceil((until - Date.now()) / 60000);
      log(`Rate limit cooldown active — ${remaining} min remaining. Exiting.`);
      return true;
    }
  } catch { /* stale/corrupt cooldown file — ignore */ }
  return false;
}

function setCooldown(): void {
  const until = Date.now() + COOLDOWN_MINUTES * 60 * 1000;
  try {
    writeFileSync(COOLDOWN, JSON.stringify({ until, set_at: new Date().toISOString(), cooldown_minutes: COOLDOWN_MINUTES }));
    log(`Cooldown set: next sprint no earlier than ${new Date(until).toISOString()} (+${COOLDOWN_MINUTES} min)`);
  } catch { /* non-fatal */ }
}

// ── Rate Guards (Claude token budget protection) ─────────────────────────────

/** Parse unique sprint IDs from a JSONL AAR file */
function readUniqueSprintIds(filePath: string): Map<string, number> {
  // Returns Map<sprintId, latestTimestampMs>
  const out = new Map<string, number>();
  if (!existsSync(filePath)) return out;
  try {
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(l => l.trim());
    for (const l of lines) {
      try {
        const obj = JSON.parse(l);
        const id  = obj.sprintId ?? l;
        const ts  = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now();
        if (!out.has(id) || ts > out.get(id)!) out.set(id, ts);
      } catch { /* skip corrupt lines */ }
    }
  } catch { /* non-fatal */ }
  return out;
}

/** Hard daily cap: max DAILY_SPRINT_CAP unique sprints per calendar day */
function isDailyCapReached(): boolean {
  try {
    const today   = new Date().toISOString().slice(0, 10);
    const aarFile = join(ROOT, 'logs', 'aar', `${today}.jsonl`);
    const ids     = readUniqueSprintIds(aarFile);
    const count   = ids.size;
    if (count >= DAILY_SPRINT_CAP) {
      log(`Daily cap reached: ${count}/${DAILY_SPRINT_CAP} sprints today. Pausing until midnight.`);
      sendTelegram(`🚫 *Sprint Runner* — daily cap reached\\n\\n${count}/${DAILY_SPRINT_CAP} sprints today.\\nResuming tomorrow.`);
      return true;
    }
    log(`Daily sprint count: ${count}/${DAILY_SPRINT_CAP}`);
  } catch { /* non-fatal */ }
  return false;
}

/** Rolling window cap: max ROLLING_CAP unique sprints in the last ROLLING_WINDOW_HRS hours */
function isRollingCapReached(): boolean {
  try {
    const now       = Date.now();
    const windowMs  = ROLLING_WINDOW_HRS * 60 * 60 * 1000;
    const cutoff    = now - windowMs;

    // Collect IDs from today's AND yesterday's AAR (window may span midnight)
    const todayStr     = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const aarDir       = join(ROOT, 'logs', 'aar');

    const allIds = new Map<string, number>();
    for (const day of [yesterdayStr, todayStr]) {
      const ids = readUniqueSprintIds(join(aarDir, `${day}.jsonl`));
      ids.forEach((ts, id) => {
        if (!allIds.has(id) || ts > allIds.get(id)!) allIds.set(id, ts);
      });
    }

    const recentTimestamps: number[] = [];
    allIds.forEach(ts => { if (ts >= cutoff) recentTimestamps.push(ts); });
    const recentCount = recentTimestamps.length;
    if (recentCount >= ROLLING_CAP) {
      const oldest = recentTimestamps.reduce((min, ts) => ts < min ? ts : min, recentTimestamps[0]);
      const resumeAt = new Date(oldest + windowMs);
      log(`Rolling window cap: ${recentCount}/${ROLLING_CAP} sprints in last ${ROLLING_WINDOW_HRS}h. Resume ~${resumeAt.toISOString()}`);
      sendTelegram(`⏳ *Sprint Runner* — rolling cap reached\\n\\n${recentCount}/${ROLLING_CAP} sprints in the last ${ROLLING_WINDOW_HRS}h.\\nResume: ~${resumeAt.toISOString().slice(11, 16)} UTC`);
      return true;
    }
    log(`Rolling window: ${recentCount}/${ROLLING_CAP} sprints in last ${ROLLING_WINDOW_HRS}h`);
  } catch { /* non-fatal */ }
  return false;
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
function extractSprintNumber(filename: string): number {
  // Extract numeric sprint ID: sprint-1501.json → 1501, sprint-TICKET-008-PROMO-05.json → -1
  const match = basename(filename, '.json').match(/^sprint-(\d+)$/);
  return match ? parseInt(match[1], 10) : -1;
}

function findPendingSprint(): string | null {
  if (!existsSync(SPRINTS)) return null;

  const files = readdirSync(SPRINTS)
    .filter(f => f.endsWith('.json') && f !== 'ACTIVE_SPRINT.json')
    .sort((a, b) => {
      // Numeric sort: highest sprint number first (1506 > 1501 > 999 > 52)
      // Non-numeric files (TICKET-*, ZZGODMAN-*) get -1, sorted last
      return extractSprintNumber(b) - extractSprintNumber(a);
    });

  for (const file of files) {
    const filePath = join(SPRINTS, file);
    try {
      const content = readFileSync(filePath, 'utf8');
      const sprint: Sprint = JSON.parse(content);
      const hasPending = sprint.tasks?.some((t: Task) => t.status === 'pending');
      if (hasPending) {
        log(`Selected sprint: ${file} (sprint #${extractSprintNumber(file)})`);
        return filePath;
      }
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

  if (isInCooldown()) return;
  if (isRollingCapReached()) return;
  if (isDailyCapReached()) return;

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
  setCooldown(); // Rate limiter: enforce gap before next sprint
  sendTelegram(`🏁 *Sprint Runner* finished\\n\\n${status}\\nDuration: ${elapsed} min\\nNext sprint in: ${COOLDOWN_MINUTES} min`);

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