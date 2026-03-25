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

import { readFileSync, writeFileSync, appendFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = join(__dirname, '..', '..');
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

// Sprint 1236: AMD-21 six-vector ASMR (Associative Semantic Memory Record) format
interface ASMRVector {
  semantic_core:     string;  // what was built or achieved
  emotional_valence: string;  // sprint outcome tone: success | partial | failure | blocked
  temporal_context:  string;  // sprint date + sequence (ISO date + sprintId)
  causal_chain:      string;  // what triggered this sprint / task context
  agent_signature:   string;  // which agent + skill produced this
  confidence_score:  number;  // 0-1 reliability of extracted info
  source_sprint:     string;  // sprintId for traceability
  extracted_at:      string;  // ISO timestamp of extraction
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
// Sprint 1236: ASMR vector extraction + write to logs/asmr/
// ---------------------------------------------------------------------------

const ASMR_DIR = join(PROJECT_ROOT, 'logs', 'asmr');

function extractASMRVector(entry: AAREntry): ASMRVector {
  // Infer emotional valence from outcomeScore
  let valence: string;
  if (entry.outcomeScore >= 0.8)        valence = 'success';
  else if (entry.outcomeScore >= 0.5)   valence = 'partial';
  else if (entry.outcomeScore >= 0.2)   valence = 'blocked';
  else                                   valence = 'failure';

  // Confidence: inverse of ambiguity — penalise empty summaries
  const hasDetail = entry.actionSummary && entry.actionSummary.length > 20;
  const confidence = hasDetail ? Math.min(1, 0.6 + entry.outcomeScore * 0.4) : 0.3;

  return {
    semantic_core:     entry.actionSummary || `${entry.skillId} execution`,
    emotional_valence: valence,
    temporal_context:  `${entry.timestamp.slice(0, 10)} :: ${entry.sprintId}`,
    causal_chain:      `task:${entry.taskId} → skill:${entry.skillId}`,
    agent_signature:   `${entry.agentId}/${entry.skillId}`,
    confidence_score:  Math.round(confidence * 100) / 100,
    source_sprint:     entry.sprintId,
    extracted_at:      new Date().toISOString(),
  };
}

function writeASMRVectors(entries: AAREntry[]): number {
  if (entries.length === 0) return 0;

  mkdirSync(ASMR_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const outFile = join(ASMR_DIR, `${today}.jsonl`);

  let written = 0;
  for (const entry of entries) {
    const vector = extractASMRVector(entry);
    appendFileSync(outFile, JSON.stringify(vector) + '\n');
    written++;
  }

  return written;
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

  // Sprint 1236: Extract and persist AMD-21 ASMR vectors
  const asmrCount = writeASMRVectors(entries);

  state.totalProcessed += entries.length;
  state.lastRunAt = new Date().toISOString();
  saveState(state);

  console.log(`[observer-agent] ${new Date().toISOString()} — processed ${entries.length} AAR entries → ${deltas.size} memory deltas, ${asmrCount} ASMR vectors`);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

console.log(`[observer-agent] Starting — interval=${INTERVAL_SEC}s mode=${RUN_ONCE ? 'once' : 'loop'}`);

cycle();

if (!RUN_ONCE) {
  setInterval(cycle, INTERVAL_SEC * 1000);
}
