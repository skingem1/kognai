// SCS-001 — Experiment Tracker (Stage 9-experiment)
// Logs per-video results to workspace/scs001/experiments.jsonl.
// After enough runs, getFormulaStats() reveals which hook formulas
// and topics produce the highest QC pass rates.

import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

export interface ExperimentEntry {
  clip_id:                string;
  hook_formula:           string;
  speaker:                string;
  topic?:                 string;
  qc_passed:              boolean;
  run_id:                 string;
  timestamp:              string;
  scene_density_score?:   number;
  audio_excitement?:      number;
  clip_topic_alignment?:  number;
  partial_viral_score?:   number;
}

export interface FormulaStats {
  formula:    string;
  count:      number;
  passed:     number;
  pass_rate:  number;  // 0.0–1.0
}

export interface SpeakerStats {
  speaker:    string;
  count:      number;
  passed:     number;
  pass_rate:  number;
}

const DEFAULT_LEDGER = resolve('workspace/scs001/experiments.jsonl');

export class ExperimentTracker {
  private ledgerPath: string;

  constructor(ledgerPath?: string) {
    this.ledgerPath = ledgerPath ?? DEFAULT_LEDGER;
  }

  logExperiment(entry: ExperimentEntry): void {
    try {
      mkdirSync(dirname(this.ledgerPath), { recursive: true });
      appendFileSync(this.ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Non-fatal
    }
  }

  private readAll(): ExperimentEntry[] {
    if (!existsSync(this.ledgerPath)) return [];
    const entries: ExperimentEntry[] = [];
    const lines = readFileSync(this.ledgerPath, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return entries;
  }

  getFormulaStats(): FormulaStats[] {
    const entries = this.readAll();
    const map: Record<string, { count: number; passed: number }> = {};
    for (const e of entries) {
      if (!map[e.hook_formula]) map[e.hook_formula] = { count: 0, passed: 0 };
      map[e.hook_formula].count++;
      if (e.qc_passed) map[e.hook_formula].passed++;
    }
    return Object.entries(map)
      .map(([formula, s]) => ({
        formula,
        count:     s.count,
        passed:    s.passed,
        pass_rate: s.count > 0 ? s.passed / s.count : 0,
      }))
      .sort((a, b) => b.pass_rate - a.pass_rate);
  }

  getTopSpeakers(n = 5): SpeakerStats[] {
    const entries = this.readAll();
    const map: Record<string, { count: number; passed: number }> = {};
    for (const e of entries) {
      const key = e.speaker || 'unknown';
      if (!map[key]) map[key] = { count: 0, passed: 0 };
      map[key].count++;
      if (e.qc_passed) map[key].passed++;
    }
    return Object.entries(map)
      .map(([speaker, s]) => ({
        speaker,
        count:     s.count,
        passed:    s.passed,
        pass_rate: s.count > 0 ? s.passed / s.count : 0,
      }))
      .sort((a, b) => b.pass_rate - a.pass_rate)
      .slice(0, n);
  }

  getTotalLogged(): number {
    return this.readAll().length;
  }

  getViralStats(): { avg_viral_score: number; scored_count: number; total_count: number } {
    const entries = this.readAll();
    const scored = entries.filter(e => e.partial_viral_score != null);
    const avg = scored.length > 0
      ? scored.reduce((sum, e) => sum + (e.partial_viral_score ?? 0), 0) / scored.length
      : 0;
    return { avg_viral_score: Math.round(avg * 1000) / 1000, scored_count: scored.length, total_count: entries.length };
  }
}
