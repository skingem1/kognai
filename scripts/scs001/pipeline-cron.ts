/**
 * pipeline-cron.ts — Sprint 532
 * PM2 cron wrapper: runs pipeline → auto-deliver → log metrics.
 * Designed for 4x/day (06:00, 10:00, 14:00, 18:00).
 *
 * Usage: npx ts-node scripts/scs001/pipeline-cron.ts [--limit N]
 */

import { execSync } from 'child_process';
import { join } from 'path';
import * as https from 'https';

const ROOT = join(__dirname, '..', '..');

// Load .env
try { require('dotenv').config({ path: join(ROOT, '.env') }); } catch {}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
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

  // Step 1: Legacy archive pipeline — DISABLED (2026-03-22)
  // Legacy pipeline used Internet Archive clips with template captions.
  // Replaced by multiformat pipeline which generates original content (LLM scripts + TTS + Pillow visuals).
  // Failure logs and memory preserved in workspace/scs001/run-* directories.
  const pipelineOk = true; // Skip legacy, treat as OK
  console.log(`[pipeline-cron] Legacy pipeline DISABLED — using multiformat pipeline only`);

  // Step 1B: Run multiformat pipeline (primary pipeline — LLM scripts + TTS + original content)
  // Sprint 722: Always force-refresh to clear dedup cache — same 22 topics from 5 sources
  // rotate every run. Without this, pipeline produces 0 videos after first run.
  const mfOk = run(
    `npx ts-node --transpile-only scripts/scs001/run-multiformat-pipeline.ts --force-refresh --max=${limit}`,
    `Multiformat pipeline (${limit} videos)`,
    300000 // 5min
  );

  if (!mfOk) {
    try {
      const { appendFileSync } = require('fs');
      const errEntry = JSON.stringify({
        type: 'pipeline-cron-failure',
        stage: 'multiformat',
        timestamp: now,
        limit,
        error: 'Multiformat pipeline exited with non-zero or timed out',
      });
      appendFileSync(join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl'), errEntry + '\n');
    } catch {}
    await sendTelegram(`🚨 *Multiformat Pipeline FAILED*\nTime: ${now}\nLimit: ${limit}`);
  }

  // Step 1C: Update video inventory (Sprint 606)
  run(
    'npx ts-node --transpile-only scripts/scs001/scan-video-inventory.ts',
    'Video inventory scan',
    30000
  );

  // Step 2: Auto-deliver
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

  const status = mfOk && deliverOk ? 'OK' : 'PARTIAL';
  await sendTelegram(
    `📊 *Pipeline Cron ${status}*\n` +
    `Multiformat: ${mfOk ? '✅' : '❌'} · Deliver: ${deliverOk ? '✅' : '❌'}` +
    inventoryInfo +
    `\nTime: ${now}`
  );

  console.log(`[pipeline-cron] Done — ${status}`);
}

main().catch(e => { console.error(e); process.exit(1); });
