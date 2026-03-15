// AMD-08 Monotask State Machine
// IDLE → RESERVED → ACTIVE → IDLE (atomic, audit-logged)
// Enforces: one task per agent at a time, sub-agent chain depth ≤ 3

import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export type MonotaskState = 'IDLE' | 'RESERVED' | 'ACTIVE';

interface AgentSlot {
  state:     MonotaskState;
  taskId:    string | null;
  claimedAt: Date | null;
  depth:     number;
}

interface AuditEntry {
  ts:         string;
  agentId:    string;
  taskId:     string | null;
  transition: string;
  from:       MonotaskState;
  to:         MonotaskState;
  depth?:     number;
  reason?:    string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_DEPTH  = 3;
const AUDIT_DIR  = join(process.cwd(), 'logs', 'monotask');
const AUDIT_FILE = join(AUDIT_DIR, 'audit.jsonl');

// ── State Machine (Singleton) ────────────────────────────────────────────────

export class MonotaskSM {
  private static slots: Map<string, AgentSlot> = new Map();

  // ── Internal helpers ──────────────────────────────────────────────────────

  private static slot(agentId: string): AgentSlot {
    if (!this.slots.has(agentId)) {
      this.slots.set(agentId, { state: 'IDLE', taskId: null, claimedAt: null, depth: 0 });
    }
    return this.slots.get(agentId)!;
  }

  private static audit(entry: AuditEntry): void {
    try {
      mkdirSync(AUDIT_DIR, { recursive: true });
      appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf-8');
    } catch {
      process.stderr.write('[monotask] audit write failed\n');
    }
  }

  private static wipe(slot: AgentSlot): void {
    // Context Wipe Protocol (AMD-08 §3.3): clear all slot state
    slot.state     = 'IDLE';
    slot.taskId    = null;
    slot.claimedAt = null;
    slot.depth     = 0;
  }

  // ── Transition: IDLE → RESERVED ──────────────────────────────────────────

  /**
   * Attempt to claim an agent for a task.
   * Returns false if agent is already RESERVED or ACTIVE, or depth limit exceeded.
   * @param depth  Sub-agent chain depth (0 = top-level, 1 = first sub-agent, …)
   */
  static claim(agentId: string, taskId: string, depth = 0): boolean {
    const s    = this.slot(agentId);
    const from = s.state;

    if (from !== 'IDLE') {
      this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: 'claim_rejected',
        from, to: from, depth, reason: `Agent already ${from} on task ${s.taskId ?? '?'}` });
      process.stderr.write(`[monotask] CLAIM REJECTED — ${agentId} is ${from} (task: ${s.taskId})\n`);
      return false;
    }

    if (depth > MAX_DEPTH) {
      this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: 'depth_exceeded',
        from, to: from, depth, reason: `Depth ${depth} > MAX_DEPTH ${MAX_DEPTH}` });
      process.stderr.write(`[monotask] DEPTH EXCEEDED — ${agentId} depth ${depth} > ${MAX_DEPTH}\n`);
      return false;
    }

    s.state     = 'RESERVED';
    s.taskId    = taskId;
    s.claimedAt = new Date();
    s.depth     = depth;
    this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: 'IDLE→RESERVED',
      from: 'IDLE', to: 'RESERVED', depth });
    return true;
  }

  // ── Transition: RESERVED → ACTIVE ────────────────────────────────────────

  static start(agentId: string, taskId: string): boolean {
    const s    = this.slot(agentId);
    const from = s.state;

    if (from !== 'RESERVED') {
      this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: 'start_rejected',
        from, to: from, reason: `Expected RESERVED, got ${from}` });
      return false;
    }

    s.state = 'ACTIVE';
    this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: 'RESERVED→ACTIVE',
      from: 'RESERVED', to: 'ACTIVE', depth: s.depth });
    return true;
  }

  // ── Transition: ACTIVE → IDLE (successful completion) ────────────────────

  static complete(agentId: string, taskId: string): void {
    const s    = this.slot(agentId);
    const from = s.state;
    this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: `${from}→IDLE`,
      from, to: 'IDLE', depth: s.depth });
    this.wipe(s);
  }

  // ── Transition: any → IDLE (error / rejection between retries) ───────────

  static release(agentId: string, taskId: string, reason?: string): void {
    const s    = this.slot(agentId);
    const from = s.state;
    this.audit({ ts: new Date().toISOString(), agentId, taskId, transition: `${from}→IDLE(release)`,
      from, to: 'IDLE', depth: s.depth, reason });
    this.wipe(s);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  static getState(agentId: string): MonotaskState {
    return this.slot(agentId).state;
  }

  static getDepth(agentId: string): number {
    return this.slot(agentId).depth;
  }

  static isIdle(agentId: string): boolean {
    return this.slot(agentId).state === 'IDLE';
  }
}

// ── Smoke test ────────────────────────────────────────────────────────────────

if (require.main === module) {
  console.log('\n🤖 AMD-08 Monotask State Machine — Smoke Test\n');

  const agent = 'test-agent';

  // Happy path
  console.assert(MonotaskSM.isIdle(agent),       'should start IDLE');
  console.assert(MonotaskSM.claim(agent, 't1'),  'claim should succeed');
  console.assert(MonotaskSM.getState(agent) === 'RESERVED', 'should be RESERVED');
  console.assert(!MonotaskSM.claim(agent, 't2'), 'double-claim should fail');
  console.assert(MonotaskSM.start(agent, 't1'),  'start should succeed');
  console.assert(MonotaskSM.getState(agent) === 'ACTIVE', 'should be ACTIVE');
  MonotaskSM.complete(agent, 't1');
  console.assert(MonotaskSM.isIdle(agent),       'should be IDLE after complete');

  // Depth guard
  console.assert(MonotaskSM.claim('deep-agent', 'td', MAX_DEPTH + 1) === false,
    'depth > MAX_DEPTH should fail');

  // Release path
  MonotaskSM.claim('r-agent', 'tr');
  MonotaskSM.start('r-agent', 'tr');
  MonotaskSM.release('r-agent', 'tr', 'rejection');
  console.assert(MonotaskSM.isIdle('r-agent'), 'should be IDLE after release');

  console.log('✅ PASS — audit log written to logs/monotask/audit.jsonl\n');
}
