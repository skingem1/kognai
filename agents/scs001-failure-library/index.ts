// SCS-001 — Failure Library Agent (Agent 11 — Feedback Learning)
// Consumes: PerformanceSignal[] (failure_library_entry === true only)
// Produces: FailureEntry[] persisted to data/failure-library/
// Engine: Deterministic — KPI pattern matching for failure classification
// Per Charter: completion < 40% triggers Failure Library filing

import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import type { PerformanceSignal, PerformanceKPIs } from '../scs001-analytics/index';

export interface FailureEntry {
  entry_id:         string;
  video_id:         string;
  signal_id:        string;
  topic_tags:       string[];
  hook_formula:     string;
  speaker:          string;
  posting_slot:     string;
  kpis:             PerformanceKPIs;
  weakest_kpi:      string;
  failure_category: 'weak_hook' | 'wrong_audience' | 'bad_timing' | 'low_production' | 'unknown';
  avoidance_rule:   string;
  filed_at:         string;
}

function findWeakestKPI(kpis: PerformanceKPIs): string {
  const normalized: Record<string, number> = {
    completion_rate: kpis.completion_rate / 100,
    rewatch_rate:    kpis.rewatch_rate / 100,
    shares:          Math.min(kpis.shares / 50, 1),
    comments:        Math.min(kpis.comments / 100, 1),
    views:           Math.min(kpis.views / 10000, 1),
  };

  let weakest = 'completion_rate';
  let lowest = 1;
  for (const [key, val] of Object.entries(normalized)) {
    if (val < lowest) {
      lowest = val;
      weakest = key;
    }
  }
  return weakest;
}

function classifyFailure(kpis: PerformanceKPIs): FailureEntry['failure_category'] {
  // weak_hook: low completion + low rewatch = didn't capture attention
  if (kpis.completion_rate < 25 && kpis.rewatch_rate < 10) {
    return 'weak_hook';
  }

  // wrong_audience: low shares + low comments = content-audience mismatch
  if (kpis.shares < 5 && kpis.comments < 10) {
    return 'wrong_audience';
  }

  // bad_timing: decent rewatch but low views = posted at wrong time
  if (kpis.rewatch_rate >= 10 && kpis.views < 5000) {
    return 'bad_timing';
  }

  // low_production: low completion but decent engagement signals
  if (kpis.completion_rate < 30 && kpis.shares >= 5) {
    return 'low_production';
  }

  return 'unknown';
}

function generateAvoidanceRule(
  entry: Omit<FailureEntry, 'avoidance_rule'>,
): string {
  const topic = entry.topic_tags[0] ?? 'unknown topic';
  const speaker = entry.speaker;

  switch (entry.failure_category) {
    case 'weak_hook':
      return 'Avoid hook formula "' + entry.hook_formula + '" with topic "' + topic +
        '" — completion was ' + entry.kpis.completion_rate + '% (threshold: 40%). Try a different hook approach.';
    case 'wrong_audience':
      return 'Topic "' + topic + '" with speaker "' + speaker +
        '" had minimal engagement (shares: ' + entry.kpis.shares + ', comments: ' + entry.kpis.comments +
        '). Consider different audience targeting or topic framing.';
    case 'bad_timing':
      return 'Slot "' + entry.posting_slot + '" underperformed for topic "' + topic +
        '" — only ' + entry.kpis.views + ' views despite ' + entry.kpis.rewatch_rate +
        '% rewatch. Try a different time slot.';
    case 'low_production':
      return 'Production quality issue with "' + topic + '" — viewers dropped off early (' +
        entry.kpis.completion_rate + '% completion) despite interest signals. Review editing/caption quality.';
    default:
      return 'Content with topic "' + topic + '" and formula "' + entry.hook_formula +
        '" underperformed at ' + entry.kpis.completion_rate + '% completion. Review all factors.';
  }
}

export class FailureLibraryAgent {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir ?? 'data/failure-library';
  }

  run(signals: PerformanceSignal[]): FailureEntry[] {
    const allFailureSignals = signals.filter(s => s.failure_library_entry);

    // Dedup by video_id: same video published across 9 platforms (Blotato) produces
    // 9 PerformanceSignals with the same video_id. Keep only the worst-performing
    // signal (lowest completion_rate) per unique video to avoid triple/9× filing.
    const worstByVideo = new Map<string, PerformanceSignal>();
    for (const sig of allFailureSignals) {
      const existing = worstByVideo.get(sig.video_id);
      if (!existing || sig.kpis.completion_rate < existing.kpis.completion_rate) {
        worstByVideo.set(sig.video_id, sig);
      }
    }
    const failureSignals = Array.from(worstByVideo.values());

    console.log('[FailureLibrary] ' + failureSignals.length + ' unique video(s) flagged (' +
      allFailureSignals.length + ' signals, ' + signals.length + ' total)');

    if (failureSignals.length === 0) {
      console.log('[FailureLibrary] No failures to file');
      return [];
    }

    const entries: FailureEntry[] = [];

    for (const signal of failureSignals) {
      const weakestKpi = findWeakestKPI(signal.kpis);
      const category = classifyFailure(signal.kpis);

      const partialEntry = {
        entry_id:         'fail-' + randomUUID().substring(0, 8),
        video_id:         signal.video_id,
        signal_id:        signal.signal_id,
        topic_tags:       signal.topic_performance.topic_tags,
        hook_formula:     signal.hook_formula_performance.formula,
        speaker:          signal.speaker_performance.speaker_name,
        posting_slot:     signal.posting_slot_performance.slot,
        kpis:             signal.kpis,
        weakest_kpi:      weakestKpi,
        failure_category: category,
        filed_at:         new Date().toISOString(),
      };

      const entry: FailureEntry = {
        ...partialEntry,
        avoidance_rule: generateAvoidanceRule(partialEntry),
      };

      entries.push(entry);
      this.persist(entry);

      console.log('[FailureLibrary] Filed ' + signal.video_id + ' → ' + category +
        ' (weakest: ' + weakestKpi + ', ' + signal.kpis.completion_rate + '% completion)');
    }

    console.log('[FailureLibrary] ' + entries.length + ' entries filed to ' + this.storageDir);
    return entries;
  }

  private persist(entry: FailureEntry): void {
    if (!existsSync(this.storageDir)) mkdirSync(this.storageDir, { recursive: true });
    const filename = this.storageDir + '/' + entry.entry_id + '.json';
    writeFileSync(filename, JSON.stringify(entry, null, 2));
  }
}
