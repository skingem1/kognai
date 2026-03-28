/**
 * ORACLE-6 Consumer — Kognai Intelligence Memory Writer
 * SCS-002 (Voxight) × AMD-05 (IRL Intelligence Layer)
 *
 * Scheduled by PM2 cron (every 6 hours).
 * 1. Fetches Intelligence Signals from Voxight's Supabase (no x402 cost)
 * 2. Writes all signals to workspace/intelligence/oracle-6-voxight/signals/YYYY-MM-DD.json
 * 3. Flags purpose signal candidates (confidence ≥ 75) to workspace/intelligence/signals/
 * 4. Sends Telegram notification for each new purpose candidate
 * 5. On Mondays: writes ORACLE-6 section to weekly report
 *
 * @version 1.0.0 — Filed: 2026-03-28
 * @see workspace/shared-context/SCS_002_CHARTER.md — Section 11 Integration Record
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as dotenv from 'dotenv';

import {
  fetchSignalsDirect,
  fetchPurposeCandidates,
  type Oracle6DirectSignal,
  type DirectFetchResult,
} from './lib/voxight-client';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT       = path.resolve(__dirname, '..');
const INTEL_DIR  = path.join(ROOT, 'workspace', 'intelligence');
const O6_DIR     = path.join(INTEL_DIR, 'oracle-6-voxight', 'signals');
const SIG_DIR    = path.join(INTEL_DIR, 'signals');
const REPORT_DIR = path.join(INTEL_DIR, 'weekly-reports');

// ─── Config ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN  = process.env.TELEGRAM_BOT_TOKEN  ?? '';
const TELEGRAM_CHAT   = process.env.OWNER_TELEGRAM_CHAT_ID ?? '';
const MIN_CONFIDENCE  = 60;
const PURPOSE_THRESH  = 75;
const LOOKBACK_DAYS   = 7;

// ─── Utilities ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJSON(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  process.stdout.write(`[oracle6-consumer] ${ts} — ${msg}\n`);
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return;
  const body = JSON.stringify({ chat_id: TELEGRAM_CHAT, text, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  10000,
      },
      (res) => { res.resume(); resolve(); }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

// ─── Daily Signal File (oracle-6-voxight/signals/YYYY-MM-DD.json) ────────────

interface DailySignalFile {
  date:        string;
  fetched_at:  string;
  status:      string;
  signal_count: number;
  purpose_candidates: number;
  signals:     Oracle6DirectSignal[];
}

async function writeIntelligenceMemory(result: DirectFetchResult): Promise<void> {
  const dateStr  = today();
  const filePath = path.join(O6_DIR, `${dateStr}.json`);

  // Merge with any existing signals from earlier runs today (dedup by signal_id)
  const existing = readJSON<DailySignalFile>(filePath, {
    date: dateStr, fetched_at: result.fetched_at, status: 'empty',
    signal_count: 0, purpose_candidates: 0, signals: [],
  });

  const existingIds = new Set(existing.signals.map(s => s.signal_id));
  const newSignals  = result.signals.filter(s => !existingIds.has(s.signal_id));
  const merged      = [...existing.signals, ...newSignals];
  const candidates  = merged.filter(s => s.purpose_signal_candidate).length;

  const file: DailySignalFile = {
    date:               dateStr,
    fetched_at:         result.fetched_at,
    status:             result.status,
    signal_count:       merged.length,
    purpose_candidates: candidates,
    signals:            merged,
  };

  writeJSON(filePath, file);
  log(`Intelligence Memory written → ${filePath} (${merged.length} signals, +${newSignals.length} new)`);
}

// ─── Purpose Signal Candidates (signals/oracle6-candidates-YYYY-MM-DD.json) ──

interface PurposeCandidateFile {
  date:                string;
  generated_at:        string;
  oracle_domain:       'ORACLE-6';
  source:              'voxight';
  persistence_check:   string;
  candidate_count:     number;
  candidates:          Oracle6DirectSignal[];
}

async function writePurposeCandidates(candidates: Oracle6DirectSignal[]): Promise<void> {
  if (candidates.length === 0) return;

  const dateStr  = today();
  const filePath = path.join(SIG_DIR, `oracle6-candidates-${dateStr}.json`);

  const existing = readJSON<PurposeCandidateFile>(filePath, {
    date: dateStr, generated_at: new Date().toISOString(),
    oracle_domain: 'ORACLE-6', source: 'voxight',
    persistence_check: 'PENDING — 2-cycle check requires Godman review (AMD-05)',
    candidate_count: 0, candidates: [],
  });

  const existingIds = new Set(existing.candidates.map(s => s.signal_id));
  const newOnes     = candidates.filter(s => !existingIds.has(s.signal_id));

  if (newOnes.length === 0) {
    log('Purpose candidates: no new ones since last run');
    return;
  }

  const merged: PurposeCandidateFile = {
    ...existing,
    generated_at:    new Date().toISOString(),
    candidate_count: existing.candidates.length + newOnes.length,
    candidates:      [...existing.candidates, ...newOnes],
  };

  writeJSON(filePath, merged);
  log(`Purpose candidates written → ${filePath} (+${newOnes.length} new candidates)`);

  // Telegram notification for each new candidate
  for (const c of newOnes) {
    const msg =
      `🎯 *ORACLE-6 Purpose Signal Candidate*\n\n` +
      `*Topic:* ${c.topic}\n` +
      `*Confidence:* ${c.confidence}/100\n` +
      `*Domain:* ${c.domain} (${c.signal_type})\n` +
      `*Summary:* ${c.summary}\n\n` +
      `_Requires 2-cycle persistence check before AMD-05 filing._\n` +
      `File: \`${path.relative(ROOT, filePath)}\``;
    await sendTelegram(msg);
    log(`Telegram sent for purpose candidate: ${c.topic}`);
  }
}

// ─── Weekly Report (ORACLE-6 section update) ──────────────────────────────────

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

async function updateWeeklyReport(result: DirectFetchResult): Promise<void> {
  if (!isMonday()) return;

  const dateStr  = today();
  const filePath = path.join(REPORT_DIR, `${dateStr}.md`);

  ensureDir(REPORT_DIR);

  const topSignals = result.signals.slice(0, 5);
  const candidates = result.signals.filter(s => s.purpose_signal_candidate);

  const oracle6Section = [
    `## 5. ORACLE-6 Voxight X Intelligence Snapshot`,
    `*Generated: ${new Date().toISOString()} · ${result.signal_count} signals · ${result.purpose_candidates} purpose candidates*`,
    ``,
    `### Top Signals This Week`,
    ...topSignals.map(s =>
      `- **${s.topic}** (confidence: ${s.confidence}, type: ${s.signal_type}, domain: ${s.domain})\n  ${s.summary}`
    ),
    ``,
    `### Purpose Signal Candidates (confidence ≥ ${PURPOSE_THRESH})`,
    candidates.length === 0
      ? `*No candidates this week.*`
      : candidates.map(c =>
          `- **${c.topic}** — confidence ${c.confidence} — \`${c.signal_type}\`\n  ${c.summary}`
        ).join('\n'),
    ``,
    `### Feed Status`,
    `- Status: \`${result.status}\``,
    `- Signals in window: ${result.signal_count}`,
    `- Purpose candidates: ${result.purpose_candidates}`,
    `- Lookback: ${LOOKBACK_DAYS} days | Min confidence: ${MIN_CONFIDENCE}`,
    ``,
  ].join('\n');

  // Append or create report
  if (fs.existsSync(filePath)) {
    // Replace existing ORACLE-6 section if present
    let content = fs.readFileSync(filePath, 'utf-8');
    const sectionPattern = /## 5\. ORACLE-6.*?(?=## 6\.|$)/s;
    if (sectionPattern.test(content)) {
      content = content.replace(sectionPattern, oracle6Section + '\n');
    } else {
      content += '\n' + oracle6Section;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  } else {
    // Create new report with ORACLE-6 section
    const header = [
      `# Weekly Intelligence Report — ${dateStr}`,
      `*ORACLE domains: 1-Regulatory · 2-Economic · 3-Health · 4-Environmental · 5-Social · 6-X Intelligence*`,
      ``,
      `## 1. Executive Summary`,
      `*Pending — other oracles not yet integrated.*`,
      ``,
      `## 2. ORACLE-1 Regulatory Snapshot`,
      `*No data — ORACLE-1 not yet active.*`,
      ``,
      `## 3. ORACLE-2 Economic Snapshot`,
      `*No data — ORACLE-2 not yet active.*`,
      ``,
      `## 4. ORACLE-3–5 Combined (Health · Environmental · Social)`,
      `*No data — ORACLE-3/4/5 not yet active.*`,
      ``,
    ].join('\n');
    fs.writeFileSync(filePath, header + oracle6Section + '\n## 6. Purpose Signal Candidates\n*See oracle6-candidates file.*\n\n## 7. Filed Purpose Signals\n*None this week.*\n', 'utf-8');
  }

  log(`Weekly report updated → ${filePath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('oracle6-consumer starting');
  log(`Config: lookback=${LOOKBACK_DAYS}d, minConf=${MIN_CONFIDENCE}, purposeThresh=${PURPOSE_THRESH}`);
  log(`Telegram: ${TELEGRAM_TOKEN ? 'enabled' : 'disabled (TELEGRAM_BOT_TOKEN not set)'}`);

  // 1. Fetch latest signals from Voxight Supabase
  const result = await fetchSignalsDirect({
    lookbackDays:  LOOKBACK_DAYS,
    minConfidence: MIN_CONFIDENCE,
    limit:         200,
  });

  log(`Fetch complete: status=${result.status}, signals=${result.signal_count}, candidates=${result.purpose_candidates}`);

  if (result.status === 'degraded') {
    log('ERROR — Voxight Supabase unreachable. Check VOXIGHT_SUPABASE_KEY in .env');
    await sendTelegram('⚠️ *ORACLE-6 Consumer* — Voxight Supabase unreachable. Signal fetch FAILED. Check `VOXIGHT_SUPABASE_KEY`.');
    process.exit(1);
  }

  // 2. Write all signals to Intelligence Memory
  await writeIntelligenceMemory(result);

  // 3. Flag purpose signal candidates
  const candidates = result.signals.filter(s => s.purpose_signal_candidate);
  await writePurposeCandidates(candidates);

  // 4. Update weekly report (Mondays only)
  await updateWeeklyReport(result);

  // 5. Summary Telegram (only if there are purpose candidates or it's Monday)
  if (candidates.length > 0 || isMonday()) {
    const summary =
      `📡 *ORACLE-6 Weekly Digest* — ${today()}\n\n` +
      `Signals fetched: *${result.signal_count}*\n` +
      `Purpose candidates: *${result.purpose_candidates}*\n` +
      `Status: \`${result.status}\`\n\n` +
      (candidates.length > 0
        ? `_${candidates.length} candidate(s) need 2-cycle persistence review (AMD-05)._`
        : `_No purpose candidates this cycle._`);
    await sendTelegram(summary);
  }

  log('oracle6-consumer complete ✅');
}

main().catch((err) => {
  console.error('[oracle6-consumer] FATAL:', err);
  process.exit(1);
});
