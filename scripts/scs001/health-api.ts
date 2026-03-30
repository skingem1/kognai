#!/usr/bin/env npx ts-node
/**
 * SCS-001 Pipeline Health API — Sprint 264
 *
 * Lightweight HTTP server returning pipeline health as JSON.
 * Reads local filesystem state — no external API calls.
 *
 * Endpoints:
 *   GET /health     → full pipeline health report
 *   GET /health/gate → gate progress only
 *   GET /health/env  → environment check only
 *
 * Usage: npx ts-node scripts/scs001/health-api.ts
 * Default port: 3002 (override with HEALTH_API_PORT)
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const PORT = parseInt(process.env.HEALTH_API_PORT || '3002', 10);
const WORKSPACE = path.resolve('workspace/scs001');

// ── Data collection ──────────────────────────────────────────────────────────

function loadJsonl(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function countFiles(dir: string, ext: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length;
  } catch { return 0; }
}

function latestRunId(): string | null {
  if (!fs.existsSync(WORKSPACE)) return null;
  const runs = fs.readdirSync(WORKSPACE)
    .filter(d => d.startsWith('run-'))
    .sort()
    .reverse();
  return runs[0] || null;
}

function getGateProgress(): { posted: number; target: number; totalViews: number; viewsTarget: number; avgViews: number; daysRemaining: number; paceNeeded: number; status: string } {
  const gateDate = new Date('2026-04-07');
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((gateDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  // Sprint 293: Use manual-posts.jsonl (actual TikTok posts) not publish-ledger (pipeline output)
  const manualPosts = loadJsonl(path.join(WORKSPACE, 'manual-posts.jsonl')) as Array<{ views?: number }>;
  const posted = manualPosts.length;
  const target = 30;
  const totalViews = manualPosts.reduce((s, p) => s + (p.views ?? 0), 0);
  const viewsTarget = 500;
  const avgViews = posted > 0 ? Math.round(totalViews / posted) : 0;
  const postsLeft = Math.max(0, target - posted);
  const paceNeeded = daysRemaining > 0 && postsLeft > 0 ? Math.round(postsLeft / daysRemaining * 10) / 10 : 0;

  let status = 'ON_TRACK';
  if (posted >= target && totalViews >= viewsTarget) status = 'PASSED';
  else if (posted === 0) status = 'NOT_STARTED';
  else if (daysRemaining <= 3 && postsLeft > 0) status = 'FAILED';
  else if (daysRemaining <= 7 && postsLeft > daysRemaining * 3) status = 'CRITICAL';
  else if (daysRemaining <= 14 && postsLeft > daysRemaining * 2) status = 'WARNING';

  return { posted, target, totalViews, viewsTarget, avgViews, daysRemaining, paceNeeded, status };
}

function getEnvCheck(): Record<string, boolean> {
  const keys = [
    'ANTHROPIC_API_KEY', 'KAEL_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN', 'OWNER_TELEGRAM_CHAT_ID',
    'OLLAMA_HOST', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_PORT',
    'YOUTUBE_API_KEY', 'TIKTOK_CLIENT_KEY', 'TIKTOK_ACCESS_TOKEN', 'SCS_EDITING_MODE',
    'PEXELS_API_KEY', 'FAL_KEY',
  ];
  const result: Record<string, boolean> = {};
  for (const k of keys) {
    result[k] = Boolean(process.env[k]);
  }
  return result;
}

function getStripeReadiness(): { ready: boolean; status: string; checks: Record<string, boolean> } {
  const checks = {
    secret_key: Boolean(process.env.STRIPE_SECRET_KEY),
    webhook_secret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    webhook_port: Boolean(process.env.STRIPE_WEBHOOK_PORT),
    price_growth: Boolean(process.env.STRIPE_PRICE_GROWTH),
    price_premium: Boolean(process.env.STRIPE_PRICE_PREMIUM),
    success_url: Boolean(process.env.STRIPE_SUCCESS_URL),
    cancel_url: Boolean(process.env.STRIPE_CANCEL_URL),
  };
  const allSet = Object.values(checks).every(Boolean);
  return {
    ready: allSet,
    status: allSet ? 'Ready' : 'Not Ready — missing env vars',
    checks,
  };
}

function getPipelineStats(): Record<string, unknown> {
  const experiments = loadJsonl(path.join(WORKSPACE, 'experiments.jsonl'));
  const published = loadJsonl(path.join(WORKSPACE, 'publish-ledger.jsonl'));
  const trendOutputs = countFiles(path.join(WORKSPACE, 'trend-outputs'), '.json');
  const discoveryOutputs = countFiles(path.join(WORKSPACE, 'discovery-outputs'), '.json');
  const captionOutputs = countFiles(path.join(WORKSPACE, 'caption-outputs'), '.mp4');
  const editingDir = path.join(WORKSPACE, 'editing-outputs');
  let editingOutputs = 0;
  if (fs.existsSync(editingDir)) {
    for (const sub of fs.readdirSync(editingDir)) {
      const subPath = path.join(editingDir, sub);
      if (fs.statSync(subPath).isDirectory()) {
        editingOutputs += countFiles(subPath, '.mp4');
      }
    }
  }

  const qcPassed = experiments.filter((e: any) => e.qc_passed).length;
  const qcTotal = experiments.length;

  return {
    total_experiments: qcTotal,
    qc_passed: qcPassed,
    qc_rate: qcTotal > 0 ? Math.round(qcPassed / qcTotal * 100) : 0,
    total_published: published.length,
    trend_outputs: trendOutputs,
    discovery_outputs: discoveryOutputs,
    caption_outputs: captionOutputs,
    editing_outputs: editingOutputs,
    latest_run: latestRunId(),
  };
}

// ── Health report builder ────────────────────────────────────────────────────

export function buildHealthReport(): Record<string, unknown> {
  return {
    service: 'scs001-pipeline',
    timestamp: new Date().toISOString(),
    gate: getGateProgress(),
    pipeline: getPipelineStats(),
    stripe: getStripeReadiness(),
    environment: getEnvCheck(),
    workspace: WORKSPACE,
  };
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify(buildHealthReport(), null, 2));
  } else if (req.method === 'GET' && req.url === '/health/gate') {
    res.writeHead(200);
    res.end(JSON.stringify({ gate: getGateProgress(), timestamp: new Date().toISOString() }, null, 2));
  } else if (req.method === 'GET' && req.url === '/health/stripe') {
    const stripe = getStripeReadiness();
    res.writeHead(stripe.ready ? 200 : 503);
    res.end(JSON.stringify({ stripe, timestamp: new Date().toISOString() }, null, 2));
  } else if (req.method === 'GET' && req.url === '/health/env') {
    res.writeHead(200);
    res.end(JSON.stringify({ environment: getEnvCheck(), timestamp: new Date().toISOString() }, null, 2));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found. Try /health, /health/gate, or /health/env' }));
  }
});

// Only start server if run directly (not imported)
if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[health-api] SCS-001 Pipeline Health API on http://127.0.0.1:${PORT}/health`);
    console.log(`[health-api] Endpoints: /health, /health/gate, /health/env`);
  });
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
