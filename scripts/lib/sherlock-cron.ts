/**
 * sherlock-cron.ts — Sherlock v2 periodic QA scan (Hermes Protocol)
 *
 * Runs on a 15-minute cron schedule. For each sprint output file written
 * since the last scan, Sherlock:
 *   1. Reads the sprint output JSON
 *   2. Evaluates gate criteria (score ≥ 60, no constitutional flags)
 *   3. Updates acp_scores in Supabase
 *   4. Emits [REVIEW_REQUEST] → Harvey via sherlock_channel
 *   5. If gate fails: emits [ESCALATION_NOTICE] → godman
 *
 * Run via PM2:
 *   pm2 start scripts/lib/sherlock-cron.ts --name sherlock-cron --cron "* /15 * * * *"  (remove space)
 *
 * Or with ts-node directly:
 *   npx ts-node scripts/lib/sherlock-cron.ts
 *
 * TICKET-032-A · Sprint A · Ratified 2026-03-31
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { HermesChannel } from './hermes-channel';

// ─── Config ───────────────────────────────────────────────────────────────────

const SPRINT_OUTPUT_DIR = path.resolve(process.cwd(), 'workspace/sprint-outputs');
const SCAN_WINDOW_MS    = 15 * 60 * 1000;  // 15 minutes
const ACP_PASS_THRESHOLD = 60;

const supabase = createClient(
  process.env.SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
);

const hermes = new HermesChannel();

// ─── Types ────────────────────────────────────────────────────────────────────

interface SprintOutput {
  sprint_id:    string;
  agent:        string;
  score?:       number;
  gate_passed?: boolean;
  verdict?:     'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  notes?:       string;
  flags?:       string[];   // constitutional or security flags
}

// ─── Main scan ────────────────────────────────────────────────────────────────

async function runSherlockScan(): Promise<void> {
  console.log(`[Sherlock] Scan started at ${new Date().toISOString()}`);

  const cutoff = Date.now() - SCAN_WINDOW_MS;
  const files  = getRecentOutputFiles(cutoff);

  if (files.length === 0) {
    console.log('[Sherlock] No new sprint outputs in the last 15 minutes. [ACK]');
    return;
  }

  for (const filePath of files) {
    await evaluateSprintOutput(filePath);
  }

  console.log(`[Sherlock] Scan complete. Evaluated ${files.length} sprint(s).`);
}

// ─── File discovery ───────────────────────────────────────────────────────────

function getRecentOutputFiles(cutoffMs: number): string[] {
  if (!fs.existsSync(SPRINT_OUTPUT_DIR)) return [];

  return fs
    .readdirSync(SPRINT_OUTPUT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(SPRINT_OUTPUT_DIR, f))
    .filter(fp => {
      const stat = fs.statSync(fp);
      return stat.mtimeMs >= cutoffMs;
    });
}

// ─── Per-sprint evaluation ────────────────────────────────────────────────────

async function evaluateSprintOutput(filePath: string): Promise<void> {
  let output: SprintOutput;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    output = JSON.parse(raw) as SprintOutput;
  } catch (err) {
    console.error(`[Sherlock] Failed to parse ${filePath}:`, err);
    return;
  }

  const { sprint_id, agent, score = 0, gate_passed, verdict, notes, flags = [] } = output;
  const exchangeId = randomUUID();

  // ── 1. Emit [REVIEW_REQUEST] to harvey ──────────────────────────────────
  await hermes.post({
    from_agent:  'sherlock',
    to_agent:    'harvey',
    marker:      '[REVIEW_REQUEST]',
    message:     `Reviewing sprint ${sprint_id} — agent: ${agent}, score: ${score}, verdict: ${verdict ?? 'pending'}.`,
    exchange_id: exchangeId,
  });

  // ── 2. Detect constitutional / security flags ────────────────────────────
  const criticalFlags = flags.filter(f =>
    /hardcoded.secret|sql.injection|missing.auth|constitutional.violation/i.test(f)
  );

  if (criticalFlags.length > 0) {
    await hermes.post({
      from_agent:  'sherlock',
      to_agent:    'godman',
      marker:      '[ESCALATION_NOTICE]',
      message:     `${agent} sprint ${sprint_id}: critical flags detected — ${criticalFlags.join(', ')}. Auto-reject. Human review required.`,
      exchange_id: exchangeId,
    });
    await recordAcpScore(agent, sprint_id, score, false, `Auto-rejected: ${criticalFlags.join(', ')}`);
    return;
  }

  // ── 3. Gate check ────────────────────────────────────────────────────────
  const passed = gate_passed ?? (score >= ACP_PASS_THRESHOLD && verdict !== 'REJECTED');

  await recordAcpScore(agent, sprint_id, score, passed, notes ?? null);

  if (passed) {
    // ACK silently — do not generate noise
    await hermes.post({
      from_agent:  'sherlock',
      to_agent:    'harvey',
      marker:      '[ACK]',
      message:     `Sprint ${sprint_id} APPROVED. Score ${score}/100. All criteria met.`,
      exchange_id: exchangeId,
    });
    console.log(`[Sherlock] [ACK] Sprint ${sprint_id} — ${agent} — score ${score} — APPROVED`);
  } else {
    // Escalate to Godman
    await hermes.post({
      from_agent:  'sherlock',
      to_agent:    'godman',
      marker:      '[ESCALATION_NOTICE]',
      message:     `${agent} sprint ${sprint_id} FAILED gate (score ${score}, verdict: ${verdict ?? 'none'}). ${notes ?? ''}`,
      exchange_id: exchangeId,
    });
    console.warn(`[Sherlock] [ESCALATION_NOTICE] Sprint ${sprint_id} — ${agent} — score ${score} — FAILED`);
  }

  // ── 4. Check for ACP degradation pattern (≥3 consecutive <60) ───────────
  await checkAcpDegradation(agent, exchangeId);
}

// ─── ACP score recording ──────────────────────────────────────────────────────

async function recordAcpScore(
  agentName: string,
  sprintId:  string,
  score:     number,
  passed:    boolean,
  notes:     string | null,
): Promise<void> {
  const { error } = await supabase.from('acp_scores').insert({
    agent_name:  agentName,
    sprint_id:   sprintId,
    score,
    gate_passed: passed,
    notes,
  });

  if (error) {
    console.error(`[Sherlock] ACP score insert error for ${agentName}:`, error.message);
  }
}

// ─── Degradation detection ────────────────────────────────────────────────────

async function checkAcpDegradation(agentName: string, exchangeId: string): Promise<void> {
  const { data, error } = await supabase
    .from('acp_scores')
    .select('score, gate_passed')
    .eq('agent_name', agentName)
    .order('timestamp', { ascending: false })
    .limit(3);

  if (error || !data || data.length < 3) return;

  const allBelowThreshold = data.every(r => r.score < ACP_PASS_THRESHOLD);
  if (!allBelowThreshold) return;

  await hermes.post({
    from_agent:  'sherlock',
    to_agent:    'godman',
    marker:      '[ESCALATION_NOTICE]',
    message:     `${agentName} has scored below ${ACP_PASS_THRESHOLD} for 3 consecutive sprints. ACP degradation pattern detected. Review required.`,
    exchange_id: randomUUID(),  // new exchange for degradation alert
  });

  console.warn(`[Sherlock] ACP degradation alert: ${agentName} — 3 consecutive scores below ${ACP_PASS_THRESHOLD}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

runSherlockScan().catch(err => {
  console.error('[Sherlock] Unhandled error in scan:', err);
  process.exit(1);
});
