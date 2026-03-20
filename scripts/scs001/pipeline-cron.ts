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

  if (radarOk) {
    // Extract keywords from latest radar output and update viral-topics.json
    try {
      const { readdirSync, readFileSync: readF, writeFileSync: writeF } = require('fs');
      const radarDir = join(ROOT, 'workspace', 'scs001', 'topic-radar');
      const files = readdirSync(radarDir).filter((f: string) => f.startsWith('radar-') && f.endsWith('.json')).sort().reverse();
      if (files.length > 0) {
        const latest = JSON.parse(readF(join(radarDir, files[0]), 'utf-8'));
        const allKeywords: string[] = [];
        for (const topic of latest.topics || []) {
          if (Array.isArray(topic.keywords)) allKeywords.push(...topic.keywords);
        }
        // Dedupe and take top 10
        const unique = [...new Set(allKeywords)].slice(0, 10);
        if (unique.length > 0) {
          const viralPath = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');
          writeF(viralPath, JSON.stringify({
            topics: unique,
            updated_at: new Date().toISOString(),
            run_id: `radar-${now}`,
            source: 'topic-radar',
          }, null, 2));
          console.log(`[pipeline-cron] viral-topics.json updated with ${unique.length} radar keywords`);
        }
      }
    } catch (e: any) {
      console.log(`[pipeline-cron] Radar keyword extract failed (non-fatal): ${e.message}`);
    }
  } else {
    console.log('[pipeline-cron] Radar failed — using existing viral-topics.json');
  }

  // Step 1: Run pipeline
  const pipelineOk = run(
    `npx ts-node scripts/scs001/run-full-pipeline.ts --mock --limit ${limit}`,
    `Pipeline (${limit} videos)`,
    600000 // 10min
  );

  if (!pipelineOk) {
    // Sprint 570: Log pipeline failures
    try {
      const { appendFileSync } = require('fs');
      const errEntry = JSON.stringify({
        type: 'pipeline-cron-failure',
        stage: 'pipeline',
        timestamp: now,
        limit,
        error: 'Pipeline process exited with non-zero or timed out',
      });
      appendFileSync(join(ROOT, 'workspace', 'scs001', 'validation-errors.jsonl'), errEntry + '\n');
    } catch {}
    await sendTelegram(`🚨 *Pipeline Cron FAILED*\nTime: ${now}\nLimit: ${limit}`);
    process.exit(1);
    return;
  }

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

  // Step 5: Notify
  const status = pipelineOk && deliverOk ? 'OK' : 'PARTIAL';
  await sendTelegram(
    `📊 *Pipeline Cron ${status}*\n` +
    `Videos: ${limit}\n` +
    `Pipeline: ${pipelineOk ? '✅' : '❌'}\n` +
    `Deliver: ${deliverOk ? '✅' : '❌'}\n` +
    `Time: ${now}`
  );

  console.log(`[pipeline-cron] Done — ${status}`);
}

main().catch(e => { console.error(e); process.exit(1); });
