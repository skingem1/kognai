#!/usr/bin/env ts-node
/**
 * sprint-runner.ts — Auto-executes pending sprint tasks via dual-supervisor orchestrator
 *
 * PM2 cron: every 30 minutes — checks for pending work and runs it
 *
 * Flow:
 *   1. Check lock file (prevents parallel sprints)
 *   2. Scan sprints/ for JSON files with pending tasks
 *      Priority: week-N.json descending (newest sprint first)
 *   3. Spawn orchestrate-agents-v2.ts on the chosen sprint file
 *      (Dual supervisor: Claude Sonnet + OpenAI Codex, CEO conflict resolution)
 *   4. Telegram alert on start + finish
 *   5. Release lock when done
 *
 * GitHub Issues → Sprint Tasks:
 *   CEO creates GitHub issues as directives. To execute them, they must be
 *   converted into a sprint JSON file (sprints/week-N.json) first.
 *   The CEO bot or a human writes the sprint JSON; this runner executes it.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import * as https from 'https';
import 'dotenv/config';

// ── Config ─────────────────────────────────────────────────────────────────
const ROOT       = process.cwd();
const SPRINTS    = join(ROOT, 'sprints');
const LOCK       = join(ROOT, 'logs', 'sprint-runner.lock');
const LOG        = join(ROOT, 'logs', 'sprint-runner.log');
const MAX_HOURS  = 6; // kill orchestrator if it runs longer than this

interface Task { id: string; status: string; agent?: string; [k: string]: unknown; }

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

// ── Sprint Discovery ─────────────────────────────────────────────────────────
interface SprintInfo { file: string; pending: number; done: number; total: number; }

function findPendingSprint(): SprintInfo | null {
  if (!existsSync(SPRINTS)) return null;

  const files = readdirSync(SPRINTS)
    .filter(f => f.endsWith('.json') && f !== 'test-v2.json')
    .sort((a, b) => {
      // Sort week-N.json descending (newest sprint first)
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return nb - na;
    });

  for (const fname of files) {
    const fpath = join(SPRINTS, fname);
    try {
      const raw   = readFileSync(fpath, 'utf8');
      const data  = JSON.parse(raw);
      const tasks: Task[] = Array.isArray(data) ? data : (data.tasks || []);
      const pending = tasks.filter(t => t.status === 'pending').length;
      const done    = tasks.filter(t => t.status === 'done').length;
      if (pending > 0) {
        return { file: fpath, pending, done, total: tasks.length };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('Checking for pending sprint work...');

  if (isLocked()) {
    log('Sprint already in progress (lock file active) — exiting');
    return;
  }

  const sprint = findPendingSprint();
  if (!sprint) {
    log('No pending tasks found in any sprint file — nothing to do');
    return;
  }

  const sprintName = sprint.file.split('/').pop()!;
  log(`Found pending work: ${sprintName} (${sprint.pending} pending, ${sprint.done} done of ${sprint.total} total)`);

  acquireLock();
  const startMs = Date.now();

  sendTelegram(
    `🚀 *Sprint started: ${sprintName}*\n` +
    `Tasks: ${sprint.pending} pending | ${sprint.done} already done | ${sprint.total} total\n` +
    `Estimated time: ${Math.ceil(sprint.pending * 2.5)} min`
  );

  log(`Spawning orchestrator on: ${sprint.file}`);

  let exitCode: number | null = null;
  try {
    const result = spawnSync(
      'npx',
      ['ts-node', '--transpile-only', 'scripts/orchestrate-agents-v2.ts', sprint.file],
      {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: MAX_HOURS * 60 * 60 * 1000,
        env: { ...process.env },
      }
    );
    exitCode = result.status;
    if (result.error) throw result.error;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Orchestrator error: ${msg}`);
    sendTelegram(`🔴 *Sprint runner error*: ${msg}`);
    releaseLock();
    process.exit(1);
  }

  releaseLock();

  // Read final state
  const elapsed = Math.round((Date.now() - startMs) / 1000 / 60);
  let doneCount  = sprint.done;
  let pendingCount = sprint.pending;
  try {
    const raw   = readFileSync(sprint.file, 'utf8');
    const data  = JSON.parse(raw);
    const tasks: Task[] = Array.isArray(data) ? data : (data.tasks || []);
    doneCount    = tasks.filter(t => t.status === 'done').length;
    pendingCount = tasks.filter(t => t.status === 'pending').length;
  } catch { /* use estimates */ }

  const emoji = exitCode === 0 ? '✅' : '⚠️';
  const summary = `${emoji} *Sprint complete: ${sprintName}*\n` +
    `Done: ${doneCount}/${sprint.total} | Pending: ${pendingCount}\n` +
    `Time: ${elapsed} min`;

  log(`Finished. Done: ${doneCount}/${sprint.total}, Pending: ${pendingCount}, Exit: ${exitCode}, Time: ${elapsed}min`);
  sendTelegram(summary);

  // ── Post-Sprint Pipeline: tests → CTO review → deploy ───────────────────
  // Only run pipeline if sprint made progress (at least some tasks done)
  if (exitCode === 0 && doneCount > 0 && pendingCount === 0) {
    log('All tasks done — launching post-sprint pipeline (test → CTO review → deploy)...');
    sendTelegram(`🔬 *Post-sprint pipeline started for ${sprintName}*\nRunning tests → CTO review → auto-deploy`);

    try {
      const pipelineResult = spawnSync(
        'npx',
        ['ts-node', '--transpile-only', 'scripts/post-sprint-pipeline.ts', sprint.file],
        {
          cwd: ROOT,
          stdio: 'inherit',
          timeout: 15 * 60 * 1000, // 15 min max for tests + deploy
          env: { ...process.env },
        }
      );
      if (pipelineResult.error) throw pipelineResult.error;
      log(`Post-sprint pipeline exited: ${pipelineResult.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Post-sprint pipeline error: ${msg}`);
      sendTelegram(`⚠️ *Post-sprint pipeline error*: ${msg}`);
    }
  } else if (pendingCount > 0) {
    log(`${pendingCount} tasks still pending — skipping post-sprint pipeline (will re-run next cycle)`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log(`Fatal: ${msg}`);
  sendTelegram(`🔴 *Sprint runner crashed*: ${msg}`);
  releaseLock();
  process.exit(1);
});
