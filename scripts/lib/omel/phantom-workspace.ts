// OMEL — Phantom Workspace (Sprint 176)
// AMD-13: OS-Level Monotask Enforcement Layer
//
// PhantomWorkspace creates an isolated tmpdir per task.
// All temp file paths must go through resolve() — never to shared paths.
// Cleanup fires on task completion AND on error (caller wraps in try/finally).
// Lifecycle events logged to logs/omel/phantom-YYYY-MM-DD.jsonl.
//
// Usage:
//   const ctx = phantomWorkspace.create(task.id);
//   try { ... phantomWorkspace.resolve(ctx, 'output.json') ... }
//   finally { phantomWorkspace.cleanup(ctx); }

import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
fs.mkdirSync(LOGS_DIR, { recursive: true });

export interface PhantomContext {
  taskId:    string;
  tmpDir:    string;
  createdAt: number;
}

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
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }

  /** Create an isolated tmpdir for a task. Returns a PhantomContext handle. */
  create(taskId: string): PhantomContext {
    this.resetIfNewDay();
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `kognai-phantom-${taskId.replace(/[^a-z0-9]/gi, '-')}-`)
    );
    const ctx: PhantomContext = { taskId, tmpDir, createdAt: Date.now() };
    this.active.set(taskId, ctx);
    this.createdToday++;
    this.logEvent('create', ctx, { active_count: this.active.size });
    return ctx;
  }

  /**
   * Resolve a relative filename to the isolated tmpdir.
   * Use this for ALL temp files written during a task.
   * Prevents path traversal: only allows relative paths within the tmpDir.
   */
  resolve(ctx: PhantomContext, relativePath: string): string {
    // Strip leading slashes and parent traversal segments
    const safe    = relativePath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
    const resolved = path.join(ctx.tmpDir, safe);
    // Ensure resolved path is still within the tmpDir
    if (!resolved.startsWith(ctx.tmpDir)) {
      throw new Error(`[PhantomWorkspace] Path escape attempt: ${relativePath}`);
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

  getStats(): { active: number; created_today: number } {
    this.resetIfNewDay();
    return { active: this.active.size, created_today: this.createdToday };
  }
}

export const phantomWorkspace = new PhantomWorkspace();
