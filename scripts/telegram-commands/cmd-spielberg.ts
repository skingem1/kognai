/**
 * Telegram bot commands — Spielberg demo agent + Achiri Hetzner ops
 * Sprint 1194 (demos), Sprint 1196 (achiri-ping)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { ROOT } from './shared';

const SCRIPTS_DIR = path.join(ROOT, 'workspace', 'spielberg-scripts');
const RUNS_DIR = path.join(ROOT, 'workspace', 'scs001', 'code-demo-runs');

interface DemoEntry {
  id: string;
  label: string;
  file: string;
}

const GODMAN_DEMOS: DemoEntry[] = [
  { id: 'amf-message-format',       label: 'AMF',    file: 'amf-demo.json' },
  { id: 'drs-resource-scheduling',  label: 'DRS',    file: 'drs-demo.json' },
  { id: 'lax-latency-routing',      label: 'LAX',    file: 'lax-demo.json' },
  { id: 'pact-mandate-lifecycle',   label: 'PACT',   file: 'pact-demo.json' },
  { id: 'score-reputation-engine',  label: 'SCORE',  file: 'score-demo.json' },
  { id: 'signal-event-bus',         label: 'SIGNAL', file: 'signal-demo.json' },
  { id: 'soul-constitutional-engine', label: 'SOUL', file: 'soul-demo.json' },
];

/**
 * Sprint 1194: /demos — Godman demo recording status
 * Shows which of the 7 Godman protocol demos have been recorded (mp4 produced),
 * file sizes, and trigger commands for unrecorded ones.
 */
export function cmdDemos(): string {
  const lines: string[] = ['🎬 *Godman Demo Recordings*\n'];

  let recorded = 0;
  for (const demo of GODMAN_DEMOS) {
    const mp4 = path.join(RUNS_DIR, demo.id, `${demo.id}.mp4`);
    if (fs.existsSync(mp4)) {
      const stat = fs.statSync(mp4);
      const sizeMb = (stat.size / 1_048_576).toFixed(1);
      const ageH = Math.round((Date.now() - stat.mtimeMs) / 3_600_000);
      lines.push(`✅ *${demo.label}* — ${sizeMb}MB · ${ageH}h ago`);
      recorded++;
    } else {
      lines.push(`❌ *${demo.label}* — not recorded`);
    }
  }

  lines.push('');
  lines.push(`*${recorded}/7* demos recorded`);

  if (recorded < 7) {
    lines.push('');
    lines.push('_Produce all 7:_');
    lines.push('`npx ts-node scripts/spielberg/batch-run.ts`');
    lines.push('');
    lines.push('_Produce one:_');
    lines.push('`npx ts-node scripts/spielberg/index.ts workspace/spielberg-scripts/pact-demo.json`');
  }

  // Show batch manifest summary if available
  const manifestPath = path.join(RUNS_DIR, 'batch-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const ran = manifest.runAt ? new Date(manifest.runAt).toISOString().slice(0, 10) : '?';
      const dr = manifest.dryRun ? ' (dry-run)' : '';
      lines.push('');
      lines.push(`_Last batch: ${ran}${dr} · ${manifest.passed ?? 0}/${manifest.total ?? 0} passed_`);
    } catch { /* skip */ }
  }

  return lines.join('\n');
}

/**
 * Sprint 1196: /achiri-ping — check if Achiri API is live on Hetzner
 * Makes HTTP GET to /stats/health with 5s timeout.
 * Shows: LIVE (response time + version info) or DOWN (error + deploy command).
 */
export async function cmdAchiriPing(): Promise<string> {
  const HETZNER_IP = '65.108.90.178';
  const PORT = 3420;
  const PATH = '/stats/health';
  const TIMEOUT_MS = 5000;

  const t0 = Date.now();

  return new Promise((resolve) => {
    const req = http.get(
      { hostname: HETZNER_IP, port: PORT, path: PATH, timeout: TIMEOUT_MS },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => {
          const elapsed = Date.now() - t0;
          let info = '';
          try {
            const d = JSON.parse(body);
            const tier = d.tier ?? d.defaultTier ?? '?';
            const model = d.model ?? d.defaultModel ?? '?';
            const uptime = d.uptime_seconds != null ? `${Math.round(d.uptime_seconds / 60)}m uptime` : '';
            info = [tier !== '?' ? `tier: ${tier}` : '', model !== '?' ? `model: ${model}` : '', uptime].filter(Boolean).join(' · ');
          } catch { info = `HTTP ${res.statusCode}`; }
          const statusIcon = res.statusCode === 200 ? '✅' : '⚠️';
          resolve(
            `${statusIcon} *Achiri API — Hetzner*\n\n` +
            `*Status:* LIVE\n` +
            `*Response:* ${elapsed}ms\n` +
            (info ? `*Info:* ${info}\n` : '') +
            `\n_${HETZNER_IP}:${PORT}${PATH}_`
          );
        });
      }
    );
    req.on('error', (e: Error) => {
      resolve(
        `❌ *Achiri API — Hetzner*\n\n` +
        `*Status:* DOWN\n` +
        `*Error:* ${e.message}\n\n` +
        `_Deploy:_ \`bash scripts/achiri/deploy-hetzner.sh\`\n` +
        `_Check:_ \`/deploy-status\` for readiness checklist`
      );
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(
        `⏱ *Achiri API — Hetzner*\n\n` +
        `*Status:* TIMEOUT (${TIMEOUT_MS}ms)\n` +
        `*Target:* ${HETZNER_IP}:${PORT}\n\n` +
        `_Deploy:_ \`bash scripts/achiri/deploy-hetzner.sh\``
      );
    });
    req.setTimeout(TIMEOUT_MS);
  });
}
