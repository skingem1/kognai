/**
 * pipeline-cron.ts — Sprint 532 → Updated 2026-03-29 (Godman)
 * PM2 cron wrapper: 3-pipeline daily run (P1 + P3 + P4).
 * Runs once daily at 10:00 via ecosystem.config.js kognai-pipeline-auto.
 *
 * Pipelines per run:
 *   P1 — Hailuo/Seedance (agents/scs001-orchestrator/run-pipeline.ts live)
 *   P3 — HeyGen Avatar/Vlog (scripts/scs001/produce-vlog.ts)
 *   P4 — Bizarre Series (scripts/scs001/produce-bizarre.ts)
 *
 * Each pipeline produces 1 video. Auto-deliver posts 1 video from queue after generation.
 *
 * Usage: npx ts-node scripts/scs001/pipeline-cron.ts [--limit N]
 */

import { execSync } from 'child_process';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.KAEL_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID;

function getLimit(): number {
  const idx = process.argv.indexOf('--limit');
  if (idx >= 0 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10) || 3;
  return 3;
}

function sendTelegram(message: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return Promise.resolve();
  const payload = JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

function run(cmd: string, label: string, timeout = 600000): boolean {
  console.log(`[pipeline-cron] ${label}...`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout });
    console.log(`[pipeline-cron] ${label} — OK`);
    return true;
  } catch (e: any) {
    console.log(`[pipeline-cron] ${label} — FAILED (exit ${e.status || 'unknown'})`);
    return false;
  }
}

async function main() {
  const limit = getLimit();
  const now = new Date().toISOString();
  console.log(`[pipeline-cron] Starting at ${now} (limit: ${limit})`);

  // Step 0: Topic radar — refresh viral-topics.json with real trending data
  const radarOk = run(
    'npx ts-node scripts/scs001/topic-radar.ts',
    'Topic Radar scan',
    120000 // 2min
  );

  // Sprint 664: Use consolidate-radar.ts for enriched viral-topics.json (replaces keyword extract)
  if (radarOk) {
    run(
      'npx ts-node scripts/scs001/consolidate-radar.ts',
      'Radar consolidation',
      30000
    );
  } else {
    console.log('[pipeline-cron] Radar failed — using existing viral-topics.json');
  }

  // Step 1: Pipeline 1 (Hailuo/Seedance) — P1
  // Live mode with Hailuo 2.3 clip generation + TTS audio.
  const pipelineOk = run(
    `npx ts-node agents/scs001-orchestrator/run-pipeline.ts live`,
    `Pipeline 1 — Hailuo (live mode)`,
    600000 // 10min
  );
  if (!pipelineOk) {
    console.log('[pipeline-cron] Pipeline 1 failed — continuing to Pipeline 3');
  }

  // Step 1B: Pipeline 3 (HeyGen Avatar/Vlog) — P3
  const vlogOk = run(
    'npx ts-node scripts/scs001/produce-vlog.ts',
    'Pipeline 3 — HeyGen Vlog',
    600000 // 10min
  );
  if (!vlogOk) {
    console.log('[pipeline-cron] Pipeline 3 failed — continuing to Pipeline 4');
  }

  // Step 1C: Pipeline 4 (Bizarre Series) — P4
  const bizarreOk = run(
    'npx ts-node scripts/scs001/produce-bizarre.ts',
    'Pipeline 4 — Bizarre Series',
    600000 // 10min
  );
  if (!bizarreOk) {
    console.log('[pipeline-cron] Pipeline 4 failed — continuing to delivery');
  }

  // Step 1D: Update video inventory (Sprint 606)
  run(
    'npx ts-node --transpile-only scripts/scs001/scan-video-inventory.ts',
    'Video inventory scan',
    30000
  );

  // Step 2: Auto-deliver — post up to 1 video per pipeline (max 3)
  const deliverOk = run(
    `npx ts-node scripts/scs001/posting-auto-deliver.ts --batch ${limit}`,
    `Auto-deliver (${limit} videos)`,
    120000 // 2min
  );

  // Step 3: Log metrics
  run(
    'npx ts-node scripts/scs001/log-pipeline-metrics.ts',
    'Metrics logging',
    30000
  );

  // Step 4: Cleanup old runs (keep last 5)
  run(
    'npx ts-node scripts/scs001/pipeline-cleanup.ts --keep 5',
    'Disk cleanup',
    30000
  );

  // Step 5: Notify — include inventory stats (Sprint 606)
  let inventoryInfo = '';
  try {
    const { readFileSync: rf, existsSync: ex } = require('fs');
    const invPath = join(ROOT, 'reports', 'video-inventory.json');
    if (ex(invPath)) {
      const inv = JSON.parse(rf(invPath, 'utf-8'));
      inventoryInfo = `\nInventory: ${inv.unique_topics ?? '?'} unique · ${inv.ready_to_post ?? '?'} ready`;
      inventoryInfo += `\nGate: ${inv.gate_status?.posted ?? 0}/30 (${inv.gate_status?.gap ?? '?'} to go)`;
    }
  } catch {}

  const status = (pipelineOk || vlogOk || bizarreOk) && deliverOk ? 'OK' : 'PARTIAL';
  await sendTelegram(
    `📊 *Pipeline Cron ${status}*\n` +
    `P1 Hailuo: ${pipelineOk ? '✅' : '❌'} · P3 Vlog: ${vlogOk ? '✅' : '❌'} · P4 Bizarre: ${bizarreOk ? '✅' : '❌'} · Deliver: ${deliverOk ? '✅' : '❌'}` +
    inventoryInfo +
    `\nTime: ${now}`
  );

  console.log(`[pipeline-cron] Done — ${status}`);
}

main().catch(e => { console.error(e); process.exit(1); });
