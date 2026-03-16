// SCS-001 Pipeline Metrics Logger
// Appends per-run stats to JSONL for dashboard trend analysis

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { PipelineRunReport } from './index';

export interface PipelineMetric {
  run_id:               string;
  timestamp:            string;
  mode:                 'mock' | 'live';
  total_elapsed_ms:     number;
  topics:               number;
  clips_discovered:     number;
  clips_qualified:      number;
  clips_deduplicated:   number;
  insights:             number;
  scripts:              number;
  videos_edited:        number;
  qc_passed:            number;
  qc_failed:            number;
  published:            number;
  viral:                number;
  flywheel_derivatives: number;
  failure_entries:      number;
  stages_ok:            number;
  stages_error:         number;
}

const DEFAULT_PATH = join(process.cwd(), 'logs', 'pipeline-metrics', 'metrics.jsonl');

export function logPipelineMetric(report: PipelineRunReport, path?: string): void {
  const filePath = path ?? DEFAULT_PATH;
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const s = report.summary;
  const metric: PipelineMetric = {
    run_id:               report.run_id,
    timestamp:            report.started_at,
    mode:                 report.mode,
    total_elapsed_ms:     report.total_elapsed_ms,
    topics:               s.topics_found,
    clips_discovered:     s.clips_discovered,
    clips_qualified:      s.clips_qualified,
    clips_deduplicated:   s.clips_deduplicated,
    insights:             s.insights_generated,
    scripts:              s.scripts_produced,
    videos_edited:        s.videos_edited,
    qc_passed:            s.qc_passed,
    qc_failed:            s.qc_failed,
    published:            s.published,
    viral:                s.viral,
    flywheel_derivatives: s.flywheel_derivatives,
    failure_entries:      s.failure_entries,
    stages_ok:            report.stages.filter(st => st.status === 'ok').length,
    stages_error:         report.stages.filter(st => st.status === 'error').length,
  };

  appendFileSync(filePath, JSON.stringify(metric) + '\n', 'utf-8');
  console.log('[MetricsLogger] Metric logged for run ' + report.run_id);
}

export function readMetrics(path?: string): PipelineMetric[] {
  const filePath = path ?? DEFAULT_PATH;
  if (!existsSync(filePath)) return [];

  const metrics: PipelineMetric[] = [];
  try {
    const data = readFileSync(filePath, 'utf-8');
    for (const line of data.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        metrics.push(JSON.parse(trimmed) as PipelineMetric);
      } catch {
        console.warn('[MetricsLogger] Skipping corrupt metric line');
      }
    }
  } catch (err) {
    console.warn('[MetricsLogger] Failed to read metrics: ' + (err as Error).message);
  }
  return metrics;
}
