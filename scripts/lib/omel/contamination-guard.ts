// OMEL Contamination Guard — Sprint 180 (AMD-13)
// Task context isolation layer.
// Tracks which task each agent is currently running.
// Cross-context read (Agent A accessing Agent B's active context) → log CONTAMINATION_ATTEMPT.
//
// API:
//   claimContext(agentId, taskId): ContaminationContext
//   releaseContext(agentId, taskId): void
//   checkAccess(requestingAgentId, targetAgentId, targetTaskId): boolean
//   getActiveContext(agentId): ContaminationContext | null
//
// Audit log: logs/omel/contamination-guard-YYYY-MM-DD.jsonl

import * as fs   from 'fs';
import * as path from 'path';

// ── Interface ──────────────────────────────────────────────────────────────────

export interface ContaminationContext {
  agentId:   string;
  taskId:    string;
  startedAt: string;
}

// ── Logging ────────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(__dirname, '..', '..', '..', 'logs', 'omel');
fs.mkdirSync(LOGS_DIR, { recursive: true });

function logFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `contamination-guard-${date}.jsonl`);
}

function appendLog(entry: object): void {
  try {
    fs.appendFileSync(logFile(), JSON.stringify(entry) + '\n');
  } catch { /* never crash caller */ }
}

// ── ContaminationGuard class ──────────────────────────────────────────────────

export class ContaminationGuard {

  /** Map<agentId, ContaminationContext> — tracks which task each agent is running */
  private readonly contexts = new Map<string, ContaminationContext>();

  /**
   * Register agent as active on taskId.
   * Returns the ContaminationContext that was created.
   */
  claimContext(agentId: string, taskId: string): ContaminationContext {
    const ctx: ContaminationContext = {
      agentId,
      taskId,
      startedAt: new Date().toISOString(),
    };
    this.contexts.set(agentId, ctx);
    appendLog({ event: 'context_claimed', agentId, taskId, startedAt: ctx.startedAt });
    return ctx;
  }

  /**
   * Release agent's active context for the given taskId.
   * No-op if the agent is not currently active on that taskId.
   */
  releaseContext(agentId: string, taskId: string): void {
    const existing = this.contexts.get(agentId);
    if (existing && existing.taskId === taskId) {
      this.contexts.delete(agentId);
      appendLog({ event: 'context_released', agentId, taskId, ts: new Date().toISOString() });
    }
  }

  /**
   * Check if requestingAgentId may access targetAgentId's context on targetTaskId.
   *
   * Returns true  — same agent accessing its own context, or target has no active context.
   * Returns false — a different agent is active on targetAgent's context; logs CONTAMINATION_ATTEMPT.
   */
  checkAccess(
    requestingAgentId: string,
    targetAgentId:     string,
    targetTaskId:      string,
  ): boolean {
    // Same agent accessing its own context → always allowed
    if (requestingAgentId === targetAgentId) return true;

    const targetCtx = this.contexts.get(targetAgentId);

    // Target agent has no active context → no isolation risk
    if (!targetCtx) return true;

    // Different agent is active on targetAgent's context → contamination attempt
    const ts = new Date().toISOString();
    appendLog({
      event:              'CONTAMINATION_ATTEMPT',
      requestingAgentId,
      targetAgentId,
      targetTaskId,
      targetActiveTaskId: targetCtx.taskId,
      ts,
    });
    return false;
  }

  /**
   * Returns the active ContaminationContext for agentId, or null if none.
   */
  getActiveContext(agentId: string): ContaminationContext | null {
    return this.contexts.get(agentId) ?? null;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
export const contaminationGuard = new ContaminationGuard();
