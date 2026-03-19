// OMEL — Phantom Workspace (Sprint 176 + 181 Hardening)
// AMD-13: OS-Level Monotask Enforcement Layer
//
// PhantomWorkspace creates an isolated tmpdir per task.
// All temp file paths must go through resolve() — never to shared paths.
// Cleanup fires on task completion AND on error (caller wraps in try/finally).
// Lifecycle events logged to logs/omel/phantom-YYYY-MM-DD.jsonl.
//
// Sprint 181 hardening additions:
//   - Crash-safe cleanup: process exit handlers (SIGTERM, SIGINT, uncaughtException)
//   - Quota enforcement: PHANTOM_MAX_MB (default 500MB) per workspace
//   - Stale workspace recovery: cleanup kognai-phantom-* dirs from crashed previous runs
//   - Performance instrumentation: creation time logged, warn if >50ms
//
// Usage:
//   const ctx = phantomWorkspace.create(task.id);
//   try { ... phantomWorkspace.resolve(ctx, 'output.json') ... }
//   finally { phantomWorkspace.cleanup(ctx); }

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';
import * as https from 'https';

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
fs.mkdirSync(LOGS_DIR, { recursive: true });

const PHANTOM_MAX_BYTES = (() => {
  const mb = parseFloat(process.env.PHANTOM_MAX_MB || '500');
  return (isNaN(mb) ? 500 : mb) * 1024 * 1024;
})();

// ── Telegram fire-and-forget alert ────────────────────────────────────────────

function sendTelegramAlert(message: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN     || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return;
  const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  try {
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${botToken}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch { /* silent */ }
}

// ── Disk helpers ──────────────────────────────────────────────────────────────

function getDirSizeBytes(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSizeBytes(full);
      } else {
        try { total += fs.statSync(full).size; } catch { /* skip */ }
      }
    }
  } catch { /* dir may have been removed */ }
  return total;
}

// ── Stale workspace recovery (run once at module load) ────────────────────────

function recoverStaleWorkspaces(): void {
  const tmpDir = os.tmpdir();
  const PHANTOM_PREFIX = 'kognai-phantom-';
  try {
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (!entry.startsWith(PHANTOM_PREFIX)) continue;
      const fullPath = path.join(tmpDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isDirectory()) continue;
        // Stale if older than 1 hour (created by a crashed previous process)
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 60 * 60 * 1000) continue; // less than 1 hour old — skip
        fs.rmSync(fullPath, { recursive: true, force: true });
        const date = new Date().toISOString().slice(0, 10);
        const logFile = path.join(LOGS_DIR, `phantom-${date}.jsonl`);
        fs.appendFileSync(logFile, JSON.stringify({
          ts: new Date().toISOString(),
          event: 'stale_recovery',
          path: fullPath,
          age_ms: ageMs,
        }) + '\n');
      } catch { /* skip individual failures */ }
    }
  } catch { /* tmpdir read failed — non-fatal */ }
}

// Run stale recovery once at module load
recoverStaleWorkspaces();

// ── Interface ─────────────────────────────────────────────────────────────────

export interface PhantomContext {
  taskId:    string;
  tmpDir:    string;
  createdAt: number;
}

// ── PhantomWorkspace class ────────────────────────────────────────────────────

class PhantomWorkspace {
  private active        = new Map<string, PhantomContext>();
  private createdToday  = 0;
  private lastResetDate = new Date().toISOString().slice(0, 10);

  private resetIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.lastResetDate) {
      this.createdToday  = 0;
      this.lastResetDate = today;
    }
  }

  private logEvent(event: string, ctx: PhantomContext, extra?: Record<string, unknown>): void {
    const today   = new Date().toISOString().slice(0, 10);
    const logFile = path.join(LOGS_DIR, `phantom-${today}.jsonl`);
    const entry   = { ts: new Date().toISOString(), event, taskId: ctx.taskId,
      tmpDir: ctx.tmpDir, ...extra };
    try { fs.appendFileSync(logFile, JSON.stringify(entry) + '\n'); } catch { /* silent */ }
  }

  /** Create an isolated tmpdir for a task. Returns a PhantomContext handle. */
  create(taskId: string): PhantomContext {
    this.resetIfNewDay();
    const t0     = Date.now();
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `kognai-phantom-${taskId.replace(/[^a-z0-9]/gi, '-')}-`)
    );
    const createMs = Date.now() - t0;
    const ctx: PhantomContext = { taskId, tmpDir, createdAt: Date.now() };
    this.active.set(taskId, ctx);
    this.createdToday++;
    this.logEvent('create', ctx, {
      active_count: this.active.size,
      create_ms:    createMs,
      quota_bytes:  PHANTOM_MAX_BYTES,
    });
    if (createMs > 50) {
      this.logEvent('perf_warn', ctx, {
        message:   `Phantom workspace creation took ${createMs}ms (threshold: 50ms)`,
        create_ms: createMs,
      });
    }
    return ctx;
  }

  /**
   * Resolve a relative filename to the isolated tmpdir.
   * Use this for ALL temp files written during a task.
   * Prevents path traversal: only allows relative paths within the tmpDir.
   * Enforces PHANTOM_MAX_MB quota before write.
   */
  resolve(ctx: PhantomContext, relativePath: string): string {
    // Strip leading slashes and parent traversal segments
    const safe     = relativePath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
    const resolved = path.join(ctx.tmpDir, safe);
    // Ensure resolved path is still within the tmpDir
    if (!resolved.startsWith(ctx.tmpDir)) {
      throw new Error(`[PhantomWorkspace] Path escape attempt: ${relativePath}`);
    }
    // Quota check
    const currentBytes = getDirSizeBytes(ctx.tmpDir);
    if (currentBytes >= PHANTOM_MAX_BYTES) {
      const mb = (currentBytes / (1024 * 1024)).toFixed(1);
      this.logEvent('quota_exceeded', ctx, { current_mb: mb, limit_mb: PHANTOM_MAX_BYTES / (1024 * 1024) });
      sendTelegramAlert(
        `⚠️ *[OMEL PhantomWorkspace] Quota Exceeded*\n` +
        `Task: \`${ctx.taskId}\`\n` +
        `Size: ${mb}MB / ${(PHANTOM_MAX_BYTES / (1024 * 1024)).toFixed(0)}MB limit\n` +
        `Set PHANTOM_MAX_MB env var to adjust.`
      );
      throw new Error(`[PhantomWorkspace] Quota exceeded for task ${ctx.taskId}: ${mb}MB`);
    }
    return resolved;
  }

  /** Wipe the tmpdir and deregister the context. Safe to call multiple times. */
  cleanup(ctx: PhantomContext): void {
    if (!this.active.has(ctx.taskId)) return; // already cleaned
    const durationMs = Date.now() - ctx.createdAt;
    try {
      if (fs.existsSync(ctx.tmpDir)) {
        fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      this.logEvent('cleanup_error', ctx, { error: (err as Error).message, duration_ms: durationMs });
      this.active.delete(ctx.taskId);
      return;
    }
    this.active.delete(ctx.taskId);
    this.logEvent('cleanup', ctx, { duration_ms: durationMs, active_count: this.active.size });
  }

  /** Cleanup all currently active phantom workspaces (crash-safe exit handler). */
  cleanupAll(reason: string): void {
    const contexts = Array.from(this.active.values());
    for (const ctx of contexts) {
      try {
        if (fs.existsSync(ctx.tmpDir)) {
          fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
        }
        this.logEvent('cleanup_exit', ctx, { reason, duration_ms: Date.now() - ctx.createdAt });
      } catch { /* best-effort */ }
      this.active.delete(ctx.taskId);
    }
  }

  getStats(): { active: number; created_today: number } {
    this.resetIfNewDay();
    return { active: this.active.size, created_today: this.createdToday };
  }
}

export const phantomWorkspace = new PhantomWorkspace();

// ── Crash-safe exit handlers ───────────────────────────────────────────────────

function exitHandler(reason: string): void {
  phantomWorkspace.cleanupAll(reason);
}

process.once('SIGTERM',           () => exitHandler('SIGTERM'));
process.once('SIGINT',            () => exitHandler('SIGINT'));
process.once('uncaughtException', () => exitHandler('uncaughtException'));
