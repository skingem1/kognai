/**
 * Sherlock Sprint Review Runner — Hermes Protocol Integration
 * TICKET-032-A · 2026-03-31
 *
 * Programmatic entry point for Sherlock's sprint review pipeline.
 *
 * Responsibilities:
 *   1. Accept Sherlock review text (file, stdin, or direct call)
 *   2. Parse embedded Hermes markers from review output
 *   3. Persist exchanges to HermesChannel (JSONL + Supabase + Telegram)
 *   4. Sync ACP scores to Supabase after each review cycle
 *
 * Usage (CLI):
 *   ts-node kognai-agents/supervisor/index.ts --sprint-id SPRINT-042
 *   ts-node kognai-agents/supervisor/index.ts --sprint-id SPRINT-042 --input /tmp/review.txt
 *   cat review.txt | ts-node kognai-agents/supervisor/index.ts --sprint-id SPRINT-042
 *
 * Usage (programmatic):
 *   import { runSprintReview } from './kognai-agents/supervisor';
 *   const result = await runSprintReview(reviewText, 'SPRINT-042');
 */

import { readFileSync } from 'fs';
import { parseArgs } from 'util'; // Node 18+
import { hermesChannel } from '../../scripts/lib/hermes-channel';
import type { HermesExchange } from '../../scripts/lib/hermes-channel';

export const SHERLOCK_AGENT = 'sherlock';

// ── Public result type ────────────────────────────────────────────────────────

export interface SprintReviewResult {
  /** Sprint ID that was reviewed (undefined if not provided) */
  sprintId: string | undefined;
  /** Number of Hermes markers found and persisted */
  markersFound: number;
  /** Exchanges opened/updated by this review */
  exchanges: HermesExchange[];
  /** Whether ACP scores were successfully synced to Supabase */
  acpSynced: boolean;
  /** Milliseconds taken */
  durationMs: number;
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Process a Sherlock sprint review text through the Hermes Protocol.
 *
 * - Parses [REVIEW_REQUEST], [STATUS_REQUEST], [ESCALATION_NOTICE], [ACK] markers
 * - Opens exchanges and persists them to the Hermes channel
 * - Syncs ACP scores to Supabase (fire-and-forget)
 */
export async function runSprintReview(
  reviewText: string,
  sprintId?: string,
): Promise<SprintReviewResult> {
  const start = Date.now();

  // 1. Parse and persist Hermes markers from review output
  const exchanges = hermesChannel.processOutput(reviewText, SHERLOCK_AGENT, sprintId);

  if (exchanges.length > 0) {
    const summary = exchanges.map(e => `${e.messages[0]?.marker}(${e.status})`).join(', ');
    console.error(`[sherlock] Hermes: ${exchanges.length} exchange(s) opened — ${summary}`);
  }

  // 2. Sync ACP scores to Supabase (fire-and-forget, non-blocking)
  let acpSynced = false;
  try {
    await hermesChannel.syncACPScores();
    acpSynced = true;
  } catch {
    /* non-blocking — ACP sync failure never interrupts review flow */
  }

  return {
    sprintId,
    markersFound: exchanges.length,
    exchanges,
    acpSynced,
    durationMs: Date.now() - start,
  };
}

// ── ACP score update ──────────────────────────────────────────────────────────

/**
 * Record a sprint verdict in the ACP trust-scores file and sync to Supabase.
 * Called after each review to update Sherlock's own performance metrics.
 *
 * @param verdict 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'
 * @param score   0–100 quality score from the review
 */
export async function recordVerdict(
  verdict: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
  score: number,
  sprintId?: string,
): Promise<void> {
  // Log verdict locally — ACP trust score updates are handled by post-sprint-governance
  const entry = {
    ts: new Date().toISOString(),
    agent: SHERLOCK_AGENT,
    sprint_id: sprintId ?? null,
    verdict,
    score,
  };
  console.error(`[sherlock] Verdict recorded: ${JSON.stringify(entry)}`);

  // Trigger ACP sync so Supabase reflects latest state
  await hermesChannel.syncACPScores().catch(() => {});
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let sprintId: string | undefined;
  let inputPath: string | undefined;

  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        'sprint-id': { type: 'string', short: 's' },
        'input':     { type: 'string', short: 'i' },
      },
    });
    sprintId  = values['sprint-id'] as string | undefined;
    inputPath = values['input']     as string | undefined;
  } catch {
    // Fallback: treat first positional arg as sprint-id
    sprintId = process.argv[2];
  }

  // Read review text: from file, stdin, or nothing
  let reviewText = '';
  if (inputPath) {
    reviewText = readFileSync(inputPath, 'utf-8');
  } else if (!process.stdin.isTTY) {
    reviewText = readFileSync('/dev/stdin', 'utf-8');
  }

  if (!reviewText.trim()) {
    console.log('[sherlock] No review text provided — nothing to process.');
    process.exit(0);
  }

  const result = await runSprintReview(reviewText, sprintId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        sprint_id:     result.sprintId ?? null,
        markers_found: result.markersFound,
        acp_synced:    result.acpSynced,
        duration_ms:   result.durationMs,
        exchanges: result.exchanges.map(e => ({
          exchange_id: e.exchange_id.slice(0, 8) + '...',
          status:      e.status,
          marker:      e.messages[0]?.marker,
          sequence:    e.messages[0]?.sequence,
        })),
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch(err => {
    console.error('[sherlock] Fatal:', err.message);
    process.exit(1);
  });
}
