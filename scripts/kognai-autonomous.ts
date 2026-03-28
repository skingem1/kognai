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
  files_to_modify?: string[];    // kept for reference; orchestrator reads `deliverables`
  deliverables?: string[] | { code?: string[]; tests?: string[]; docs?: string[] };
  sprint_id?:  string;
  context?:    string;
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

/**
 * Maps informal agent nicknames (used in sprint queue) to actual agent
 * directory names under agents/ (as loaded by orchestrate-agents-v2.ts).
 * The orchestrator registers agents via `agents.set(name, ...)` where `name`
 * is the directory name — informal names cause "Agent not found" rejections.
 */
const AGENT_NAME_MAP: Record<string, string> = {
  // Coding / implementation agents
  messi:    'coder',
  macgyver: 'coder',
  coder:    'coder',
  // Strategy / oversight agents
  harvey:    'ceo',
  ceo:       'ceo',
  // QA / review agents
  sherlock:   'supervisor',
  supervisor: 'supervisor',
  // Specialised agents (pass-through)
  intelligence: 'intelligence',
  chomsky:      'chomsky',
  constitution: 'constitution',
};

function normalizeAgentName(name: string | undefined): string {
  if (!name) return 'coder';
  const key = name.toLowerCase().trim();
  return AGENT_NAME_MAP[key] ?? 'coder'; // unknown names fall back to coder
}

// ─── Cross-project context injection ─────────────────────────────────────────

/**
 * Absolute path to the Voxight backend project on this machine.
 * The Kognai swarm's coder agent runs from ROOT (~/kognai/) as CWD.
 * For VOXIGHT sprints, we inject absolute paths so the coder writes
 * files into the correct project rather than producing nothing.
 */
const VOXIGHT_ROOT = '/Users/tarekmnif/Documents/Voxight';

interface ProjectContext {
  files_to_read:   string[];
  files_to_modify: string[];
  description_suffix: string;
}

/**
 * Per-sprint context for Voxight blocks.
 * files_to_read  → loaded by brief-generator and injected into the coder prompt
 * files_to_modify → the target file(s) the coder must produce / update
 * description_suffix → appended to the task description so the coder knows
 *                       the project root and the exact file path to create.
 */
const VOXIGHT_SPRINT_CONTEXT: Record<string, ProjectContext> = {
  'VOXIGHT-BLOCK-A-01': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/whisperLocal.js`,
      `${VOXIGHT_ROOT}/src/services/twitterApi.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/scripts/batch-transcribe.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/scripts/batch-transcribe.js` +
      `\nRead whisperLocal.js and twitterApi.js first for API signatures.` +
      `\nThe script must: (1) query Supabase spaces table for all spaces with recording_url, ` +
      `(2) for each space call transcribeLocal(audioPath) from whisperLocal.js, ` +
      `(3) write JSONL output to ${VOXIGHT_ROOT}/voxight-data/transcripts/YYYY-MM-DD.jsonl, ` +
      `(4) be idempotent — skip spaces already in transcripts table. ` +
      `Use ES module syntax (import/export). Include a main() guard.`,
  },
  'VOXIGHT-BLOCK-A-02': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/database.js`,
      `${VOXIGHT_ROOT}/src/server.js`,
      `${VOXIGHT_ROOT}/src/routes/space.js`,
      `${VOXIGHT_ROOT}/src/middleware/x402Payment.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/routes/transcripts.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/routes/transcripts.js` +
      `\nAlso MODIFY: ${VOXIGHT_ROOT}/src/server.js to register the new route.` +
      `\nBuild GET /api/transcripts with query params: domain, from (ISO date), speaker.` +
      `\nQuery Supabase transcripts table. Apply x402 payment gate ($0.03 USDC).` +
      `\nReturn paginated JSON array of transcript objects with timestamps.` +
      `\nUse same pattern as routes/space.js for structure.`,
  },
  'VOXIGHT-BLOCK-B-01': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/qwen3Insights.js`,
      `${VOXIGHT_ROOT}/src/services/oracleSignals.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/scripts/produce-signals.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/scripts/produce-signals.js` +
      `\nRead qwen3Insights.js and oracleSignals.js first for API signatures.` +
      `\nThe script must: (1) query transcripts table for unprocessed transcripts ` +
      `(no corresponding row in insights table), (2) for each call extractInsights() ` +
      `from qwen3Insights.js, (3) call createSignal() from oracleSignals.js to write ` +
      `IntelligenceSignal to signals table, (4) mark transcript as processed. ` +
      `IntelligenceSignal fields: domain, signal_type, topic, summary, evidence, confidence_score. ` +
      `Use ES module syntax. Include a main() guard with error handling.`,
  },
  'VOXIGHT-BLOCK-C-01': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/postsStream.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
      `${VOXIGHT_ROOT}/src/services/twitterApi.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/scripts/scrape-posts.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/scripts/scrape-posts.js` +
      `\nThe script must: (1) use twitterApi.js fetchRecentSearch() to pull posts for ` +
      `each tracked domain (AI, crypto, regulation, web3), (2) score sentiment via ` +
      `Ollama qwen3:4b with a short prompt, (3) tag each post by domain, (4) upsert ` +
      `into Supabase posts table. Include deduplication by post_id. ES module syntax.`,
  },
  'VOXIGHT-BLOCK-C-02': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/hashtagIntelligence.js`,
      `${VOXIGHT_ROOT}/src/services/baselineComputation.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/services/hashtagIntelligence.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to MODIFY: ${VOXIGHT_ROOT}/src/services/hashtagIntelligence.js` +
      `\nAdd computeVelocity(tag, windowHours) that returns posts/hour for the given ` +
      `tag over the rolling window. Add computeEngagementRate(tag) = avg (likes+RTs)/post. ` +
      `Expose detectEmergingTrends() that combines baseline comparison with velocity ` +
      `and returns tags crossing the isSignificantTrend() threshold from baselineComputation.js.`,
  },
  'VOXIGHT-BLOCK-D-01': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/oracleSignals.js`,
      `${VOXIGHT_ROOT}/src/services/crossSignalCorrelation.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/scripts/merge-signals.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/scripts/merge-signals.js` +
      `\nThe script must: (1) fetch Space signals (signal_type=spaces_insight) and ` +
      `Post signals (signal_type=hashtag_emergence, thought_leader_alert) from ` +
      `oracleSignals.js, (2) apply confidence-weighted merge: if same topic appears ` +
      `in both ≥2 signal types within 7 days, boost confidence += 15 and set ` +
      `purpose_signal_candidate=true, (3) apply decay_rate_hours: reduce confidence ` +
      `by 5% per elapsed decay window, (4) write merged view back to signals table. ` +
      `Run via crossSignalCorrelation.js patterns. ES module syntax.`,
  },
  'VOXIGHT-BLOCK-D-02': {
    files_to_read: [
      `${VOXIGHT_ROOT}/src/services/oracleSignals.js`,
      `${VOXIGHT_ROOT}/src/routes/signals.js`,
      `${VOXIGHT_ROOT}/src/services/database.js`,
    ],
    files_to_modify: [
      `${VOXIGHT_ROOT}/src/scripts/weekly-oracle-report.js`,
    ],
    description_suffix:
      `\n\nProject root: ${VOXIGHT_ROOT}` +
      `\nTarget file to CREATE: ${VOXIGHT_ROOT}/src/scripts/weekly-oracle-report.js` +
      `\nThe script generates a weekly Oracle intelligence report: ` +
      `(1) query top 5 signals per domain (AI, crypto, regulation, web3) by confidence, ` +
      `(2) list all purpose_signal_candidate=true signals, ` +
      `(3) list SCS-001 topic recommendations (top signals relevant to content creation), ` +
      `(4) write report as Markdown to ${VOXIGHT_ROOT}/reports/oracle/YYYY-MM-DD.md, ` +
      `(5) also store report JSON in Supabase for API access. ES module syntax.`,
  },
};

function sprintFilePath(sprintId: string): string {
  return path.join(SPRINTS_DIR, `sprint-${sprintId}.json`);
}

function sprintFileExists(sprintId: string): boolean {
  return fs.existsSync(sprintFilePath(sprintId));
}

function generateSprintFile(item: QueueItem): string {
  const sprintId  = getSprintId(item);
  const filePath  = sprintFilePath(sprintId);
  let   taskDesc  = item.rationale || item.description || item.title || `Execute sprint ${sprintId}`;
  const taskFiles = item.files_to_modify || item.files_to_read || [];

  // ── Cross-project context injection ──────────────────────────────────────
  // For Voxight sprints the coder runs in ~/kognai/ but must write files into
  // the Voxight project.  Without explicit paths, the agent produces nothing.
  const voxCtx = VOXIGHT_SPRINT_CONTEXT[sprintId];
  if (voxCtx) {
    taskDesc += voxCtx.description_suffix;
    log(`🗺  Injecting Voxight project context for ${sprintId}`);
  }

  const filesRead   = voxCtx ? voxCtx.files_to_read   : taskFiles;
  const filesModify = voxCtx ? voxCtx.files_to_modify  : [];

  const sprint: SprintFile = {
    sprint_id:     `sprint-${sprintId}`,
    title:         item.title || `Sprint ${sprintId}`,
    source:        'queue-prescribed',
    generated_by:  'kognai-autonomous',
    generated_at:  new Date().toISOString(),
    tasks: [
      {
        id:          sprintId,
        description: taskDesc,
        status:      'pending',
        agent:       normalizeAgentName(item.agent),
        // 'create' bypasses the CodingAgent pre-flight check that requires files to
        // already exist. VOXIGHT tasks always create NEW files in the Voxight repo.
        type:        voxCtx ? 'create' : 'code',
        priority:    item.priority || 'P1',
        ...(filesRead.length   > 0 ? { files_to_read:   filesRead   } : {}),
        ...(filesModify.length > 0 ? { deliverables: filesModify } : {}),
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
