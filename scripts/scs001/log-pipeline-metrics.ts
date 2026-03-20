#!/usr/bin/env npx ts-node
/**
 * log-pipeline-metrics.ts — Sprint 529
 * Consolidates pipeline run reports into metrics JSONL + Supabase kognai_events.
 *
 * Reads from:
 *   - workspace/scs001/pipeline-runs/*.json  (run-full-pipeline reports)
 *   - reports/pipeline-runs/*.json           (orchestrator reports)
 *
 * Outputs:
 *   - logs/pipeline-metrics/metrics.jsonl    (append new entries only)
 *   - Supabase kognai_events table           (if SUPABASE_URL set)
 *
 * Usage: npx ts-node scripts/scs001/log-pipeline-metrics.ts [--supabase]
 */

import { readdirSync, readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const METRICS_FILE = join(ROOT, 'logs', 'pipeline-metrics', 'metrics.jsonl');
const WORKSPACE_RUNS = join(ROOT, 'workspace', 'scs001', 'pipeline-runs');
const REPORTS_RUNS = join(ROOT, 'reports', 'pipeline-runs');

const useSupabase = process.argv.includes('--supabase');

// ── Load already-logged run IDs ──────────────────────

function getLoggedRunIds(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(METRICS_FILE)) return ids;
  const lines = readFileSync(METRICS_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.run_id) ids.add(obj.run_id);
    } catch {}
  }
  return ids;
}

// ── Parse workspace pipeline reports ─────────────────

interface WorkspaceReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  mode: { mock: boolean; dry_run: boolean; cloud: boolean; limit: number };
  steps: Array<{ step: string; status: string; duration_ms: number; cost_usd: number; items_in: number; items_out: number }>;
  total_duration_ms: number;
  total_cost_usd: number;
  videos_produced: number;
  summary: string;
}

function loadWorkspaceRuns(): WorkspaceReport[] {
  if (!existsSync(WORKSPACE_RUNS)) return [];
  return readdirSync(WORKSPACE_RUNS)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(readFileSync(join(WORKSPACE_RUNS, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean) as WorkspaceReport[];
}

// ── Convert to metrics entry ─────────────────────────

interface MetricsEntry {
  run_id: string;
  timestamp: string;
  source: string;
  mode: string;
  total_duration_ms: number;
  total_cost_usd: number;
  videos_produced: number;
  steps_passed: number;
  steps_failed: number;
  summary: string;
}

function workspaceToMetrics(r: WorkspaceReport): MetricsEntry {
  return {
    run_id: r.run_id,
    timestamp: r.started_at,
    source: 'run-full-pipeline',
    mode: r.mode.mock ? 'mock' : (r.mode.cloud ? 'cloud' : 'local'),
    total_duration_ms: r.total_duration_ms,
    total_cost_usd: r.total_cost_usd,
    videos_produced: r.videos_produced,
    steps_passed: r.steps.filter(s => s.status === 'pass').length,
    steps_failed: r.steps.filter(s => s.status === 'fail').length,
    summary: r.summary,
  };
}

// ── Supabase logger ──────────────────────────────────

async function logToSupabase(entries: MetricsEntry[]): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('[supabase] SUPABASE_URL or key not set — skipping');
    return 0;
  }

  let logged = 0;
  for (const entry of entries) {
    const event = {
      event_type: 'pipeline_metrics',
      payload: entry,
      created_at: entry.timestamp,
    };

    try {
      const parsed = new URL(`${url}/rest/v1/kognai_events`);
      const postData = JSON.stringify(event);
      await new Promise<void>((resolve, reject) => {
        const req = https.request({
          hostname: parsed.hostname,
          port: 443,
          path: parsed.pathname + parsed.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Prefer': 'return=minimal',
            'Content-Length': Buffer.byteLength(postData),
          },
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            if (res.statusCode && res.statusCode < 300) {
              logged++;
              resolve();
            } else {
              console.log(`[supabase] Error ${res.statusCode}: ${body}`);
              resolve(); // don't block on errors
            }
          });
        });
        req.on('error', (e) => { console.log(`[supabase] ${e.message}`); resolve(); });
        req.write(postData);
        req.end();
      });
    } catch (e: any) {
      console.log(`[supabase] ${e.message}`);
    }
  }
  return logged;
}

// ── Main ─────────────────────────────────────────────

async function main() {
  // Ensure output dir
  const metricsDir = join(ROOT, 'logs', 'pipeline-metrics');
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });

  const loggedIds = getLoggedRunIds();
  console.log(`[metrics] ${loggedIds.size} runs already logged`);

  // Load workspace runs
  const wsRuns = loadWorkspaceRuns();
  console.log(`[metrics] ${wsRuns.length} workspace pipeline reports found`);

  // Filter new runs
  const newEntries: MetricsEntry[] = [];
  for (const run of wsRuns) {
    if (!loggedIds.has(run.run_id)) {
      newEntries.push(workspaceToMetrics(run));
    }
  }

  console.log(`[metrics] ${newEntries.length} new runs to log`);

  if (newEntries.length === 0) {
    console.log('[metrics] Nothing new to log');
    return;
  }

  // Sort by timestamp
  newEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Append to JSONL
  for (const entry of newEntries) {
    appendFileSync(METRICS_FILE, JSON.stringify(entry) + '\n');
  }
  console.log(`[metrics] ✅ ${newEntries.length} entries appended to ${METRICS_FILE}`);

  // Supabase
  if (useSupabase) {
    const count = await logToSupabase(newEntries);
    console.log(`[metrics] ✅ ${count}/${newEntries.length} logged to Supabase`);
  }

  // Summary
  const totalVideos = newEntries.reduce((s, e) => s + e.videos_produced, 0);
  const totalCost = newEntries.reduce((s, e) => s + e.total_cost_usd, 0);
  console.log(`[metrics] Summary: ${newEntries.length} runs, ${totalVideos} videos, $${totalCost.toFixed(4)} cost`);
}

main().catch(e => { console.error(e); process.exit(1); });
