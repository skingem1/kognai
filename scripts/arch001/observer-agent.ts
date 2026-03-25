/**
 * observer-agent.ts — AMD-21 Memory Merger Observer
 * Sprint 1231 / ARCH-001
 *
 * Reads AAR log entries from logs/aar/, applies temporal supersession
 * (newer entries override older for same agent+skill), and writes merged
 * memory deltas to workspace/memory/.
 *
 * Run: npx tsx scripts/arch001/observer-agent.ts [--once]
 * In tmux: window 3 of kognai-amd21 session
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, '..', '..');
const AAR_DIR = join(PROJECT_ROOT, 'logs', 'aar');
const MEMORY_DIR = join(PROJECT_ROOT, 'workspace', 'memory');
const STATE_FILE = join(MEMORY_DIR, '.observer-state.json');
const INTERVAL_SEC = Number(process.env['OBSERVER_INTERVAL_SEC'] ?? 300); // 5 min default
const RUN_ONCE = process.argv.includes('--once');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AAREntry {
  receiptId: string;
  agentId: string;
  taskId: string;
  sprintId: string;
  skillId: string;
  outcomeScore: number;
  actionSummary: string;
  timestamp: string;
  status: string;
}

interface MemoryDelta {
  agentId: string;
  skillId: string;
  latestSprintId: string;
  latestScore: number;
  latestAction: string;
  latestTimestamp: string;
  entryCount: number;
  avgScore: number;
}

interface ObserverState {
  lastProcessedFile: string;
  lastProcessedLine: number;
  lastRunAt: string;
  totalProcessed: number;
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function loadState(): ObserverState {
  if (!existsSync(STATE_FILE)) {
    return { lastProcessedFile: '', lastProcessedLine: 0, lastRunAt: '', totalProcessed: 0 };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { lastProcessedFile: '', lastProcessedLine: 0, lastRunAt: '', totalProcessed: 0 };
  }
}

function saveState(state: ObserverState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// AAR reading
// ---------------------------------------------------------------------------

function readAARFiles(state: ObserverState): AAREntry[] {
  if (!existsSync(AAR_DIR)) return [];

  const files = readdirSync(AAR_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort();

  const entries: AAREntry[] = [];

  for (const file of files) {
    // Skip files before the last processed one
    if (file < state.lastProcessedFile) continue;

    const lines = readFileSync(join(AAR_DIR, file), 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    const startLine = file === state.lastProcessedFile ? state.lastProcessedLine : 0;

    for (let i = startLine; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]) as AAREntry);
      } catch {
        // skip malformed lines
      }
    }

    // Update state to track position
    state.lastProcessedFile = file;
    state.lastProcessedLine = lines.length;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Temporal supersession merge
// ---------------------------------------------------------------------------

function mergeEntries(entries: AAREntry[]): Map<string, MemoryDelta> {
  const map = new Map<string, MemoryDelta>();

  for (const entry of entries) {
    const key = `${entry.agentId}::${entry.skillId}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        agentId: entry.agentId,
        skillId: entry.skillId,
        latestSprintId: entry.sprintId,
        latestScore: entry.outcomeScore,
        latestAction: entry.actionSummary,
        latestTimestamp: entry.timestamp,
        entryCount: 1,
        avgScore: entry.outcomeScore,
      });
    } else {
      existing.entryCount++;
      existing.avgScore = (existing.avgScore * (existing.entryCount - 1) + entry.outcomeScore) / existing.entryCount;

      // Temporal supersession: newer entry wins
      if (entry.timestamp > existing.latestTimestamp) {
        existing.latestSprintId = entry.sprintId;
        existing.latestScore = entry.outcomeScore;
        existing.latestAction = entry.actionSummary;
        existing.latestTimestamp = entry.timestamp;
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Write memory deltas
// ---------------------------------------------------------------------------

function writeDeltas(deltas: Map<string, MemoryDelta>): void {
  if (deltas.size === 0) return;

  mkdirSync(MEMORY_DIR, { recursive: true });

  const deltaFile = join(MEMORY_DIR, 'aar-merged-deltas.json');
  let existing: Record<string, MemoryDelta> = {};

  if (existsSync(deltaFile)) {
    try {
      existing = JSON.parse(readFileSync(deltaFile, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  // Merge new deltas into existing (supersession)
  for (const [key, delta] of deltas) {
    const prev = existing[key];
    if (!prev || delta.latestTimestamp > prev.latestTimestamp) {
      existing[key] = delta;
    }
  }

  writeFileSync(deltaFile, JSON.stringify(existing, null, 2));
}

// ---------------------------------------------------------------------------
// Main cycle
// ---------------------------------------------------------------------------

function cycle(): void {
  const state = loadState();
  const entries = readAARFiles(state);

  if (entries.length === 0) {
    console.log(`[observer-agent] ${new Date().toISOString()} — no new AAR entries`);
    state.lastRunAt = new Date().toISOString();
    saveState(state);
    return;
  }

  const deltas = mergeEntries(entries);
  writeDeltas(deltas);

  state.totalProcessed += entries.length;
  state.lastRunAt = new Date().toISOString();
  saveState(state);

  console.log(`[observer-agent] ${new Date().toISOString()} — processed ${entries.length} AAR entries → ${deltas.size} memory deltas`);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log(`[observer-agent] Starting — interval=${INTERVAL_SEC}s mode=${RUN_ONCE ? 'once' : 'loop'}`);

cycle();

if (!RUN_ONCE) {
  setInterval(cycle, INTERVAL_SEC * 1000);
}
