#!/usr/bin/env npx tsx
/**
 * ARCH-001 — Observer Agent Polling Loop
 * Sprint 998
 *
 * Usage:
 *   OBSERVER_ID=observer-1 OBSERVER_WORKERS=worker-a,worker-b npx tsx observer.ts
 *   OBSERVER_ID=observer-1 INTERVAL_SEC=30 STALL_THRESHOLD_SEC=300 npx tsx observer.ts
 *
 * Reads workers.json every INTERVAL_SEC. Emits AMF observation reports to
 * _orchestrator/escalations/ when anomalies are detected.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = join(__dirname, '_orchestrator');
const WORKERS_FILE = join(BASE, 'workers.json');
const HEARTBEAT_FILE = join(BASE, 'heartbeat.json');
const ESCALATION_DIR = join(BASE, 'escalations');

const OBSERVER_ID   = process.env['OBSERVER_ID']          ?? 'observer-1';
const WATCH_IDS     = (process.env['OBSERVER_WORKERS'] ?? '').split(',').filter(Boolean);
const INTERVAL_SEC  = Number(process.env['INTERVAL_SEC']  ?? 60);
const STALL_SEC     = Number(process.env['STALL_THRESHOLD_SEC'] ?? 600);
const HEARTBEAT_MAX = INTERVAL_SEC * 3;           // heartbeat older than 3× = session stalled

// ---------------------------------------------------------------------------
// Types (inline — no import needed for types)
// ---------------------------------------------------------------------------

interface Worker {
  id: string;
  agentId: string;
  taskId?: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'halted';
  model?: string;
  startedAt: string;
  updatedAt?: string;
  cost?: number;
}

interface WorkersFile {
  version: string;
  sessionId: string;
  updatedAt: string;
  workers: Worker[];
}

interface Anomaly {
  type: 'stalled' | 'failed' | 'heartbeat_stale' | 'cost_overrun';
  workerId?: string;
  agentId?: string;
  detail: string;
  severity: 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

let cycle = 0;

function readWorkers(): WorkersFile | null {
  try {
    return JSON.parse(readFileSync(WORKERS_FILE, 'utf8')) as WorkersFile;
  } catch {
    return null;
  }
}

function heartbeatAgeMs(): number {
  try {
    const hb = JSON.parse(readFileSync(HEARTBEAT_FILE, 'utf8')) as { ts: string };
    return Date.now() - new Date(hb.ts).getTime();
  } catch {
    return Infinity;
  }
}

function detectAnomalies(state: WorkersFile): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const now = Date.now();

  // Heartbeat check
  const hbAge = heartbeatAgeMs();
  if (hbAge > HEARTBEAT_MAX * 1000) {
    anomalies.push({
      type: 'heartbeat_stale',
      detail: `Heartbeat is ${Math.round(hbAge / 1000)}s old (max ${HEARTBEAT_MAX}s)`,
      severity: 'critical',
    });
  }

  const targets = WATCH_IDS.length > 0
    ? state.workers.filter(w => WATCH_IDS.includes(w.id))
    : state.workers;

  for (const w of targets) {
    // Stall detection — running workers exceeding stall threshold
    if (w.status === 'running') {
      const runMs = now - new Date(w.startedAt).getTime();
      if (runMs > STALL_SEC * 1000) {
        anomalies.push({
          type: 'stalled',
          workerId: w.id,
          agentId: w.agentId,
          detail: `Worker ${w.id} (${w.agentId}) has been running for ${Math.round(runMs / 1000)}s (limit ${STALL_SEC}s)`,
          severity: 'warning',
        });
      }
    }

    // Failed worker
    if (w.status === 'failed') {
      anomalies.push({
        type: 'failed',
        workerId: w.id,
        agentId: w.agentId,
        detail: `Worker ${w.id} (${w.agentId}) status is FAILED`,
        severity: 'critical',
      });
    }
  }

  return anomalies;
}

function emitReport(state: WorkersFile | null, anomalies: Anomaly[]): void {
  const report = {
    amf: '0.1',
    id: randomUUID(),
    sender: OBSERVER_ID,
    recipient: 'orchestrator',
    sentAt: new Date().toISOString(),
    payload: {
      type: 'event',
      topic: 'observer.report',
      data: {
        cycle,
        sessionId: state?.sessionId ?? 'unknown',
        observedWorkers: WATCH_IDS.length > 0 ? WATCH_IDS : 'all',
        anomalies,
        summary: anomalies.length === 0
          ? 'All clear'
          : `${anomalies.filter(a => a.severity === 'critical').length} critical, ${anomalies.filter(a => a.severity === 'warning').length} warning`,
      },
    },
  };

  const label = anomalies.length > 0 ? '⚠' : '✓';
  console.log(`[${new Date().toISOString()}] ${OBSERVER_ID} cycle=${cycle} ${label} ${report.payload.data.summary}`);

  // Write to escalations/ only when anomalies exist
  if (anomalies.length > 0) {
    mkdirSync(ESCALATION_DIR, { recursive: true });
    const fname = join(ESCALATION_DIR, `${Date.now()}-${OBSERVER_ID}.json`);
    writeFileSync(fname, JSON.stringify(report, null, 2));
    console.log(`  → escalation written: ${fname}`);
  }
}

async function observe(): Promise<void> {
  cycle++;
  const state = readWorkers();
  const anomalies = state ? detectAnomalies(state) : [{
    type: 'heartbeat_stale' as const,
    detail: 'workers.json unreadable — orchestrator may be down',
    severity: 'critical' as const,
  }];
  emitReport(state, anomalies);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

console.log(`[${OBSERVER_ID}] Starting observer — interval=${INTERVAL_SEC}s stall=${STALL_SEC}s watching=${WATCH_IDS.join(',') || 'all'}`);

if (!existsSync(WORKERS_FILE)) {
  console.warn(`[WARN] workers.json not found at ${WORKERS_FILE} — will retry`);
}

void observe().then(() => {
  setInterval(() => void observe(), INTERVAL_SEC * 1000);
});
