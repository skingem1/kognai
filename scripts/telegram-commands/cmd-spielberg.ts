/**
 * Telegram bot commands — Spielberg demo agent
 * Sprint 1194
 */

import * as fs from 'fs';
import * as path from 'path';
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
