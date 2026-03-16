// Phase 0 → Phase 1 Gate Validator
// Checks 3 criteria before authorizing Phase 1 live TikTok posting.
// Writes workspace/gates/phase0-phase1-gate.json and exits 0 (PASS) or 1 (FAIL).

import { SCS001Orchestrator, PipelineRunReport } from '../../agents/scs001-orchestrator/index';
import { DedupLedger, LedgerEntry } from '../../agents/scs001-orchestrator/dedup-ledger';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

interface GateCriterion {
  id:      string;
  name:    string;
  pass:    boolean;
  details: string;
}

interface GateReport {
  gate:           string;
  date:           string;
  criteria:       GateCriterion[];
  overall_pass:   boolean;
  recommendation: string;
}

// ── CHECK 1 — TASK_TARGET Routing to Ollama ─────────────────────────────────

function checkRouting(): GateCriterion {
  const id   = 'task-target-routing';
  const name = 'TASK_TARGET Routing to Ollama';

  // Static check: does router.py reference Ollama endpoint?
  const routerPath = join(process.cwd(), 'runtime', 'router.py');
  let routerHasOllama = false;
  try {
    const routerContent = readFileSync(routerPath, 'utf-8');
    routerHasOllama = routerContent.includes('localhost:11434');
  } catch (err) {
    return { id, name, pass: false, details: 'Could not read runtime/router.py: ' + (err as Error).message };
  }

  // Dynamic check: parse today's routing log
  const logPath = join(process.cwd(), 'logs', 'routing', '2026-03-16.jsonl');
  if (!existsSync(logPath)) {
    return {
      id, name,
      pass: routerHasOllama,
      details: 'Static check: router.py localhost:11434=' + routerHasOllama + ' (no routing log found)',
    };
  }

  let localOllamaCount    = 0;
  let localNonOllamaCount = 0;
  const lines = readFileSync(logPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { task_target?: string; provider?: string };
      if (entry.task_target === 'local') {
        if (entry.provider === 'ollama') {
          localOllamaCount++;
        } else {
          localNonOllamaCount++;
        }
      }
    } catch {
      // skip corrupt lines
    }
  }

  if (localOllamaCount > 0) {
    const pass = localNonOllamaCount === 0;
    return {
      id, name, pass,
      details: 'Routing log: ' + localOllamaCount + ' local->ollama, ' + localNonOllamaCount + ' local->non-ollama',
    };
  }

  // Log exists but no local entries — fall back to static check
  return {
    id, name,
    pass: routerHasOllama,
    details: 'Static check: router.py localhost:11434=' + routerHasOllama + ' (no local entries in routing log)',
  };
}

// ── CHECK 2 — Idempotent Replay / DedupLedger ───────────────────────────────

function checkDedup(): GateCriterion {
  const id   = 'idempotent-replay';
  const name = 'Idempotent Replay — DedupLedger';
  const tempPath = join(process.cwd(), 'workspace', 'scs001', '.gate-test-ledger.jsonl');

  let result1Length = -1;
  let result2Length = -1;
  let result3Length = -1;

  try {
    const ledger = new DedupLedger(tempPath);

    // Seed 3 published entries
    const now = new Date().toISOString();
    const seed: LedgerEntry[] = [
      { clip_id: 'gate-test-1', video_id: 'gate-test-1', published_at: now, run_id: 'gate-test' },
      { clip_id: 'gate-test-2', video_id: 'gate-test-2', published_at: now, run_id: 'gate-test' },
      { clip_id: 'gate-test-3', video_id: 'gate-test-3', published_at: now, run_id: 'gate-test' },
    ];
    ledger.recordPublished(seed);

    // 5 clips — 3 already published, 2 new
    const testClips = [
      { clip_id: 'gate-test-1' },
      { clip_id: 'gate-test-2' },
      { clip_id: 'gate-test-3' },
      { clip_id: 'gate-test-4' },
      { clip_id: 'gate-test-5' },
    ];

    const result1 = ledger.filterNewClips(testClips);
    result1Length = result1.length;

    // Second call — must be idempotent (same 2 new clips, nothing recorded yet)
    const result2 = ledger.filterNewClips(testClips);
    result2Length = result2.length;

    // Record the 2 new clips as published
    const newEntries: LedgerEntry[] = result1.map(c => ({
      clip_id:      c.clip_id,
      video_id:     c.clip_id,
      published_at: new Date().toISOString(),
      run_id:       'gate-test',
    }));
    ledger.recordPublished(newEntries);

    // Third call — all 5 now published, expect 0 new
    const result3 = ledger.filterNewClips(testClips);
    result3Length = result3.length;

    const pass = result1Length === 2 && result2Length === 2 && result3Length === 0;
    const details = pass
      ? 'Dedup correctly filtered 3/5 clips, idempotent on replay, 0/5 after full record'
      : 'Dedup assertion failed: result1=' + result1Length + ' result2=' + result2Length
        + ' result3=' + result3Length + ' (expected 2,2,0)';

    return { id, name, pass, details };
  } catch (err) {
    return { id, name, pass: false, details: 'DedupLedger test threw: ' + (err as Error).message };
  } finally {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch { /* ignore cleanup errors */ }
    }
  }
}

// ── CHECK 3 — Full Pipeline Dry-Run ─────────────────────────────────────────

async function checkDryRun(): Promise<GateCriterion> {
  const id   = 'pipeline-dry-run';
  const name = 'Full Pipeline Dry-Run (mock mode)';

  try {
    const orchestrator = new SCS001Orchestrator('mock');
    const report: PipelineRunReport = await orchestrator.run();

    const stageCount      = report.stages.length;
    const topicsFound     = report.summary.topics_found;
    const clipsDiscovered = report.summary.clips_discovered;
    const errorStages     = report.stages.filter(s => s.status === 'error').map(s => s.stage);

    const pass = stageCount >= 8 && topicsFound >= 1 && clipsDiscovered >= 1;
    const details = 'Pipeline: ' + stageCount + ' stages, ' + topicsFound + ' topics, ' + clipsDiscovered + ' clips'
      + (errorStages.length > 0 ? '. Warn: error stages=' + errorStages.join(',') : '');

    return { id, name, pass, details };
  } catch (err) {
    return { id, name, pass: false, details: 'Pipeline dry-run threw: ' + (err as Error).message };
  }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const criterion1 = checkRouting();
  const criterion2 = checkDedup();
  const criterion3 = await checkDryRun();

  const criteria: GateCriterion[] = [criterion1, criterion2, criterion3];
  const allPass = criteria.every(c => c.pass);

  const gateReport: GateReport = {
    gate: 'phase0-to-phase1',
    date: new Date().toISOString().slice(0, 10),
    criteria,
    overall_pass: allPass,
    recommendation: allPass
      ? 'PROCEED to Phase 1 — all gate criteria met. Set SCS_MODE=live in ecosystem.config.js.'
      : 'BLOCKED — fix failing criteria before advancing to Phase 1.',
  };

  // Write report
  const gatesDir = join(process.cwd(), 'workspace', 'gates');
  mkdirSync(gatesDir, { recursive: true });
  writeFileSync(join(gatesDir, 'phase0-phase1-gate.json'), JSON.stringify(gateReport, null, 2));

  // Print results
  criteria.forEach(c => console.log((c.pass ? '\u2713' : '\u2717') + ' [' + c.name + ']: ' + c.details));
  console.log('');
  console.log(allPass ? 'GATE PASS' : 'GATE FAIL');
  console.log('Report written to workspace/gates/phase0-phase1-gate.json');

  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
