/**
 * kognai-autonomous.ts — Kognai Self-Starter
 * ============================================
 * Wired into PM2 as a cron (every 4 hours).
 * Picks the next pending sprint from workspace/sprint-queue.json,
 * generates a sprint file if one does not exist, runs the swarm,
 * and updates the queue status.
 *
 * No human trigger needed — Harvey wakes up on his own.
 *
 * Flags:
 *   --dry-run    Print what would run but do NOT execute the swarm.
 *   --sovereign  Force all inference to local Ollama (default when Ollama reachable).
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { execSync, spawnSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
dotenvConfig({ path: path.join(ROOT, '.env') });

const DRY_RUN    = process.argv.includes('--dry-run');
const QUEUE_FILE = path.join(ROOT, 'workspace', 'sprint-queue.json');
const SPRINTS_DIR = path.join(ROOT, 'workspace', 'sprints');
const LOCK_FILE  = path.join(ROOT, 'workspace', '.autonomous-lock');
const LOG_PREFIX = '[kognai-autonomous]';

// Lock expires after 90 minutes — prevents stale locks from a crashed run
const LOCK_TTL_MS = 90 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id?:       string;
  sprint?:   string;
  title?:    string;
  status?:   string;
  priority?: string;
  rationale?: string;
  description?: string;
  agent?:    string;
  block?:    string;
  files_to_read?: string[];
  files_to_modify?: string[];
  files_to_create?: string[];
}

interface SprintFile {
  sprint_id: string;
  title:     string;
  source:    string;
  generated_by: string;
  generated_at: string;
  tasks:     SprintTask[];
}

interface SprintFile {
  sprint_id: string;
  title:     string;
  source:    string;
  generated_by: string;
  generated_at: string;
  tasks:     SprintTask[];
}

interface SprintTask {
  id:          string;
  description: string;
  status:      string;
  agent?:      string;
  type?:       string;
  priority?:   string;
  files_to_read?: string[];
  files_to_modify?: string[];
  sprint_id?:  string;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${LOG_PREFIX} ${msg}`);
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN || process.env.CEO_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    log('⚠️  Telegram not configured — skipping alert');
    return;
  }
  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  return new Promise(resolve => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      () => resolve()
    );
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

// ─── Lock management ──────────────────────────────────────────────────────────

function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      const age = Date.now() - new Date(raw.acquired_at).getTime();
      if (age < LOCK_TTL_MS) {
        log(`🔒 Lock held by sprint ${raw.sprint_id} (acquired ${Math.floor(age / 60000)}min ago) — skipping this run`);
        return false;
      }
      log(`⚠️  Stale lock found (${Math.floor(age / 60000)}min old) — overriding`);
    } catch {
      log('⚠️  Corrupt lock file — overriding');
    }
  }
  return true;
}

function writeLock(sprintId: string): void {
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ sprint_id: sprintId, acquired_at: new Date().toISOString(), pid: process.pid }, null, 2));
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

// ─── Queue operations ─────────────────────────────────────────────────────────

function readQueue(): { meta: Record<string, unknown>; queue: QueueItem[] } {
  const raw = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
  const queue: QueueItem[] = raw.queue || [];
  const meta: Record<string, unknown> = { ...raw };
  delete meta.queue;
  return { meta, queue };
}

function writeQueue(meta: Record<string, unknown>, queue: QueueItem[]): void {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify({ ...meta, queue }, null, 2) + '\n');
}

function getSprintId(item: QueueItem): string {
  return (item.sprint || item.id || 'unknown').toString();
}

function pickNextSprint(queue: QueueItem[]): QueueItem | null {
  const priority_order = ['P0', 'P1', 'P2', 'P3'];
  for (const pri of priority_order) {
    const candidates = queue.filter(
      item => item.status === 'pending' && item.priority === pri
    );
    if (candidates.length > 0) return candidates[0];
  }
  // Fallback: any pending item
  return queue.find(item => item.status === 'pending') || null;
}

function updateQueueStatus(queue: QueueItem[], sprintId: string, status: string, extra?: Partial<QueueItem>): void {
  for (const item of queue) {
    const id = getSprintId(item);
    if (id === sprintId) {
      item.status = status;
      if (extra) Object.assign(item, extra);
      return;
    }
  }
  log(`⚠️  Could not find sprint ${sprintId} in queue to update status`);
}

// ─── Sprint file generation ───────────────────────────────────────────────────

function sprintFilePath(sprintId: string): string {
  return path.join(SPRINTS_DIR, `sprint-${sprintId}.json`);
}

function sprintFileExists(sprintId: string): boolean {
  return fs.existsSync(sprintFilePath(sprintId));
}

function generateSprintFile(item: QueueItem): string {
  const sprintId  = getSprintId(item);
  const filePath  = sprintFilePath(sprintId);
  const taskDesc  = item.rationale || item.description || item.title || `Execute sprint ${sprintId}`;
  const taskFiles = item.files_to_modify || item.files_to_read || [];

  const sprint: SprintFile = {
    sprint_id:     `sprint-${sprintId}`,
    title:         item.title || `Sprint ${sprintId}`,
    source:        'queue-auto-generated',
    generated_by:  'kognai-autonomous',
    generated_at:  new Date().toISOString(),
    tasks: [
      {
        id:          sprintId,
        description: taskDesc,
        status:      'pending',
        agent:       item.agent || 'coder',
        type:        'code',
        priority:    item.priority || 'P1',
        ...(taskFiles.length > 0 ? { files_to_read: taskFiles } : {}),
        sprint_id:   `sprint-${sprintId}`,
      },
    ],
  };

  fs.writeFileSync(filePath, JSON.stringify(sprint, null, 2) + '\n');
  log(`📝 Generated sprint file: ${path.relative(ROOT, filePath)}`);
  return filePath;
}

// ─── Ollama availability check ────────────────────────────────────────────────

async function ollamaIsUp(): Promise<boolean> {
  const baseUrl = process.env.VAULT_OLLAMA_URL || 'http://localhost:11434';
  try {
    await new Promise<void>((resolve, reject) => {
      const mod = baseUrl.startsWith('https') ? https : http;
      const req = mod.get(`${baseUrl}/api/tags`, { timeout: 3000 }, res => {
        res.resume();
        res.statusCode && res.statusCode < 500 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Swarm runner ─────────────────────────────────────────────────────────────

function runSwarm(sprintFilePath: string, sovereign: boolean): { success: boolean; exitCode: number; durationMs: number } {
  const start   = Date.now();
  const relPath = path.relative(ROOT, sprintFilePath);
  const script  = path.join(ROOT, 'scripts', 'run-swarm.sh');
  const args    = sovereign ? ['--sovereign', relPath] : [relPath];

  log(`🚀 Launching swarm: ${script} ${args.join(' ')}`);

  const result = spawnSync('bash', [script, ...args], {
    cwd: ROOT,
    stdio: 'inherit', // pipes to PM2 log
    timeout: 60 * 60 * 1000, // 60 minute hard cap per sprint
    env: { ...process.env },
  });

  const durationMs = Date.now() - start;
  const success    = result.status === 0 && !result.error;

  if (result.error) {
    log(`❌ Swarm process error: ${result.error.message}`);
  }

  return { success, exitCode: result.status ?? -1, durationMs };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  log(`🌅 Kognai Self-Starter — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // ── 1. Read queue ────────────────────────────────────────────────────────
  if (!fs.existsSync(QUEUE_FILE)) {
    log('❌ sprint-queue.json not found — aborting');
    return;
  }

  const { meta, queue } = readQueue();

  // ── 2. Pick next sprint ──────────────────────────────────────────────────
  const item = pickNextSprint(queue);
  if (!item) {
    log('✅ No pending sprints — queue is clear. Nothing to do.');
    return;
  }

  const sprintId = getSprintId(item);
  const pri      = item.priority || '?';
  log(`📌 Next sprint: [${pri}] ${sprintId} — ${(item.title || '').slice(0, 70)}`);

  // ── 3. Acquire lock ──────────────────────────────────────────────────────
  if (!acquireLock()) {
    log('⏸  Another autonomous run is active — exiting');
    return;
  }
  writeLock(sprintId);

  try {
    // ── 4. Check Ollama ─────────────────────────────────────────────────
    const ollamaUp = await ollamaIsUp();
    if (!ollamaUp) {
      log('⚠️  Ollama is not reachable — skipping autonomous run (cloud inference disabled in sovereign mode)');
      releaseLock();
      await sendTelegram(
        `⚠️ *Kognai Self-Starter* — skipped\n\n` +
        `Ollama not reachable. Sprint \`${sprintId}\` held.\n` +
        `Run \`ollama serve\` to unblock.`
      );
      return;
    }
    log(`✅ Ollama reachable — sovereign mode active`);

    // ── 5. Resolve or generate sprint file ──────────────────────────────
    let fileToRun: string;
    if (sprintFileExists(sprintId)) {
      fileToRun = sprintFilePath(sprintId);
      log(`📂 Using existing sprint file: ${path.relative(ROOT, fileToRun)}`);
    } else {
      fileToRun = generateSprintFile(item);
    }

    // ── 6. Mark in-progress ──────────────────────────────────────────────
    updateQueueStatus(queue, sprintId, 'in_progress', {
      started_at: new Date().toISOString(),
    } as Partial<QueueItem>);
    if (!DRY_RUN) {
      writeQueue(meta, queue);
    }

    // ── 7. Telegram: sprint starting ─────────────────────────────────────
    await sendTelegram(
      `🤖 *Kognai Self-Starter* — sprint starting\n\n` +
      `*Sprint:* \`${sprintId}\`\n` +
      `*Priority:* ${pri}\n` +
      `*Title:* ${(item.title || '').slice(0, 80)}\n` +
      `*Agent:* ${item.agent || 'coder'}\n\n` +
      `${DRY_RUN ? '_(dry run — swarm will NOT execute)_' : '⚡ Swarm launching now…'}`
    );

    if (DRY_RUN) {
      log(`[DRY RUN] Would run: scripts/run-swarm.sh --sovereign ${path.relative(ROOT, fileToRun)}`);
      updateQueueStatus(queue, sprintId, 'pending');
      writeQueue(meta, queue);
      releaseLock();
      return;
    }

    // ── 8. Run swarm ─────────────────────────────────────────────────────
    const { success, exitCode, durationMs } = runSwarm(fileToRun, true /* sovereign */);
    const durationMin = Math.round(durationMs / 60000);

    // ── 9. Update queue status ───────────────────────────────────────────
    const finalStatus = success ? 'done' : 'failed';
    updateQueueStatus(queue, sprintId, finalStatus, {
      completed_at: new Date().toISOString(),
      exit_code: exitCode,
      duration_minutes: durationMin,
    } as Partial<QueueItem>);
    writeQueue(meta, queue);

    log(`${success ? '✅' : '❌'} Sprint ${sprintId} ${finalStatus} in ${durationMin}min (exit ${exitCode})`);

    // ── 10. Telegram: completion report ──────────────────────────────────
    const statusIcon = success ? '✅' : '❌';
    const pendingAfter = queue.filter(q => q.status === 'pending').length;
    const doneAfter    = queue.filter(q => q.status === 'done').length;

    await sendTelegram(
      `${statusIcon} *Kognai Self-Starter* — sprint ${finalStatus}\n\n` +
      `*Sprint:* \`${sprintId}\`\n` +
      `*Duration:* ${durationMin} min\n` +
      `*Exit code:* ${exitCode}\n\n` +
      `*Queue:* ${doneAfter} done, ${pendingAfter} pending\n` +
      `Next auto-run: ~4 hours`
    );

  } finally {
    releaseLock();
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  log(`🏁 kognai-autonomous complete in ${totalSec}s`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch(err => {
  log(`💥 Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
