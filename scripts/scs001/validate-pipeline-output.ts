/**
 * Sprint 1001: Pipeline Output Validator
 * Scans pipeline-runs/ and v2-output/ for video files.
 * Runs ffprobe on each to verify playability.
 * Writes report to reports/pipeline-validator-latest.json.
 * Sends Telegram alert if any failures found.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../..');
const REPORT_PATH = path.join(ROOT, 'reports/pipeline-validator-latest.json');

const SCAN_DIRS = [
  path.join(ROOT, 'workspace/scs001/pipeline-runs'),
  path.join(ROOT, 'workspace/scs001/v2-output'),
  path.join(ROOT, 'workspace/scs001/code-demo-runs'),
];

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

interface VideoResult {
  file: string;
  ok: boolean;
  duration?: number;
  error?: string;
}

function findVideos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try { entries = fs.readdirSync(d); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e);
      let stat: fs.Stats;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full); }
      else if (VIDEO_EXTS.has(path.extname(e).toLowerCase())) {
        results.push(full);
      }
    }
  };
  walk(dir);
  return results;
}

function probeVideo(file: string): VideoResult {
  try {
    const out = execSync(
      `ffprobe -v quiet -print_format json -show_format "${file}"`,
      { timeout: 15000, encoding: 'utf8' }
    );
    const parsed = JSON.parse(out);
    const duration = parseFloat(parsed?.format?.duration ?? '0');
    if (duration <= 0) {
      return { file, ok: false, error: 'duration=0 (empty or corrupt)' };
    }
    return { file, ok: true, duration };
  } catch (e: any) {
    return { file, ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

function sendTelegram(message: string): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
  const req = https.request(
    {
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    },
    (res) => { res.resume(); }
  );
  req.on('error', () => {});
  req.write(body);
  req.end();
}

async function main() {
  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...findVideos(dir));
  }

  const results: VideoResult[] = [];
  for (const file of allFiles) {
    results.push(probeVideo(file));
  }

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  const report = {
    timestamp: new Date().toISOString(),
    checked: results.length,
    passed: passed.length,
    failed: failed.length,
    errors: failed.map(r => ({ file: path.relative(ROOT, r.file), error: r.error })),
    ok_files: passed.map(r => ({ file: path.relative(ROOT, r.file), duration: r.duration })),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[validator] checked=${report.checked} passed=${report.passed} failed=${report.failed}`);
  console.log(`[validator] report → ${REPORT_PATH}`);

  if (failed.length > 0) {
    const lines = failed.slice(0, 5).map(r => `• \`${path.relative(ROOT, r.file)}\`: ${r.error}`);
    const msg = `⚠️ *Pipeline Validator* — ${failed.length}/${results.length} videos FAILED\n\n${lines.join('\n')}`;
    sendTelegram(msg);
    console.log(`[validator] Telegram alert sent for ${failed.length} failures`);
  } else if (results.length === 0) {
    console.log('[validator] No video files found in scan dirs — nothing to validate');
  } else {
    console.log('[validator] All videos OK');
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => { console.error('[validator] Fatal:', e); process.exit(1); });
