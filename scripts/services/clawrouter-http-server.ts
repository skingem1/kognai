// ClawRouter HTTP Gateway Server — Sprint 173
// Architecture-level §17 compliance: all agents route through ONE process.
// Express wrapper around scripts/lib/clawrouter-v2.ts
//
// POST /route   — proxy routeCall() calls, returns {content, cost_usd, model, tier, local, latency_ms}
// GET  /health  — {status:'ok', uptime_s, calls_today, cost_today_usd}
// GET  /metrics — per-tier call counts, costs, latency p50/p95
//
// Port: CLAWROUTER_PORT env var (default: 3101)
// Logs: logs/clawrouter/YYYY-MM-DD.jsonl (one JSON line per call)

import express from 'express';
import * as fs   from 'fs';
import * as path from 'path';
import { routeCall }                       from '../lib/clawrouter-v2';
import { deductCost, getBalance, getDailyLedger } from '../lib/ceo-wallet';

const app = express();
app.use(express.json());

const PORT     = parseInt(process.env.CLAWROUTER_PORT ?? '3101');
const LOGS_DIR = path.join(__dirname, '..', '..', 'logs', 'clawrouter');

// Ensure logs directory exists at startup
fs.mkdirSync(LOGS_DIR, { recursive: true });

// In-memory stats (reset on process restart)
const startTime = Date.now();
const stats = {
  callsToday: 0,
  costTodayUsd: 0,
  perTier: {} as Record<string, { calls: number; costUsd: number; latencyMs: number[] }>,
};

function logEntry(entry: Record<string, unknown>): void {
  const today   = new Date().toISOString().slice(0, 10);
  const logFile = path.join(LOGS_DIR, `${today}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

function updateStats(tier: string, costUsd: number, latencyMs: number): void {
  stats.callsToday++;
  stats.costTodayUsd += costUsd;
  if (!stats.perTier[tier]) stats.perTier[tier] = { calls: 0, costUsd: 0, latencyMs: [] };
  stats.perTier[tier].calls++;
  stats.perTier[tier].costUsd += costUsd;
  stats.perTier[tier].latencyMs.push(latencyMs);
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── POST /route ─────────────────────────────────────────────────────────────
app.post('/route', async (req, res) => {
  const t0 = Date.now();
  try {
    const params = req.body;
    const result = await routeCall(params);
    const latencyMs = Date.now() - t0;
    updateStats(result.tier ?? 'unknown', result.cost_usd ?? 0, latencyMs);
    deductCost(result.cost_usd ?? 0, params.agent_id ?? 'unknown', params.task_type ?? 'unknown');
    logEntry({ ts: new Date().toISOString(), agent_id: params.agent_id, task_type: params.task_type,
      tier: result.tier, model: result.model, local: result.local,
      cost_usd: result.cost_usd, latency_ms: latencyMs, ok: true });
    res.json({ ...result, latency_ms: latencyMs });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const message = (err as Error).message;
    logEntry({ ts: new Date().toISOString(), agent_id: req.body?.agent_id, ok: false, error: message, latency_ms: latencyMs });
    res.status(500).json({ error: message });
  }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:          'ok',
    uptime_s:        Math.floor((Date.now() - startTime) / 1000),
    calls_today:     stats.callsToday,
    cost_today_usd:  stats.costTodayUsd,
  });
});

// ─── GET /metrics ─────────────────────────────────────────────────────────────
app.get('/metrics', (_req, res) => {
  const perTier: Record<string, { calls: number; cost_usd: number; p50_ms: number; p95_ms: number }> = {};
  for (const [tier, s] of Object.entries(stats.perTier)) {
    perTier[tier] = {
      calls:    s.calls,
      cost_usd: s.costUsd,
      p50_ms:   percentile(s.latencyMs, 50),
      p95_ms:   percentile(s.latencyMs, 95),
    };
  }
  res.json({ calls_today: stats.callsToday, cost_today_usd: stats.costTodayUsd, per_tier: perTier });
});

// ─── GET /wallet ──────────────────────────────────────────────────────────────
app.get('/wallet', (req, res) => {
  const date   = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const ledger = getDailyLedger(date);
  res.json({ ...getBalance(), date, ledger_entries: ledger.length, ledger });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[ClawRouter HTTP] listening on 127.0.0.1:${PORT} — logs → ${LOGS_DIR}`);
});
