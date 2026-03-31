/**
 * harvey-responder.ts — Harvey CEO auto-responder for Hermes Protocol
 *
 * Harvey reads pending [STATUS_REQUEST] messages from sherlock_channel and
 * responds with either:
 *   [REVIEW_REQUEST]  — if the sprint output needs Sherlock's evaluation
 *   [ACK]             — if Harvey can self-resolve without Sherlock review
 *
 * Harvey is NOT the gatekeeper for decisions — he routes and accelerates.
 * All [ESCALATION_NOTICE] messages go directly to Godman via KognaiBot.
 *
 * Run via PM2 alongside the main orchestrator:
 *   pm2 start scripts/lib/harvey-responder.ts --name harvey-responder
 *
 * TICKET-032-A · Sprint A · Ratified 2026-03-31
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { HermesChannel, HermesMessage } from './hermes-channel';

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;  // poll every 30 seconds

const supabase = createClient(
  process.env.SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
);

const hermes = new HermesChannel();

// ─── Harvey response logic ────────────────────────────────────────────────────

/**
 * Decide how to respond to a [STATUS_REQUEST] or [REVIEW_REQUEST] from Sherlock.
 * Returns the marker Harvey should emit back.
 */
function harveyDecide(msg: HermesMessage): '[REVIEW_REQUEST]' | '[ACK]' {
  const text = (msg.message ?? '').toLowerCase();

  // If the message mentions a critical issue or review request, route for evaluation
  if (
    text.includes('review') ||
    text.includes('gate fail') ||
    text.includes('score') ||
    text.includes('degradation') ||
    text.includes('flag') ||
    text.includes('sprint')
  ) {
    return '[REVIEW_REQUEST]';
  }

  // Status checks that don't require deep review
  return '[ACK]';
}

// ─── Process one pending message ──────────────────────────────────────────────

async function handleMessage(msg: HermesMessage): Promise<void> {
  const responseMarker = harveyDecide(msg);
  const responseBody =
    responseMarker === '[REVIEW_REQUEST]'
      ? `Harvey: routing to Sherlock for evaluation. Exchange ${msg.exchange_id}.`
      : `Harvey: acknowledged. No further action required. Exchange ${msg.exchange_id}.`;

  await hermes.post({
    from_agent:  'harvey',
    to_agent:    responseMarker === '[REVIEW_REQUEST]' ? 'sherlock' : msg.from_agent,
    marker:      responseMarker,
    message:     responseBody,
    exchange_id: msg.exchange_id,
  });

  console.log(
    `[Harvey] ${responseMarker} → ${responseMarker === '[REVIEW_REQUEST]' ? 'sherlock' : msg.from_agent} ` +
    `| exchange ${msg.exchange_id}`
  );
}

// ─── Main poll loop ───────────────────────────────────────────────────────────

async function pollAndRespond(): Promise<void> {
  // Harvey listens to messages addressed to "harvey"
  const pending = await hermes.getPendingFor('harvey');

  if (pending.length === 0) return;

  console.log(`[Harvey] ${pending.length} pending message(s) to process.`);

  for (const msg of pending) {
    await handleMessage(msg);
  }
}

// ─── Mark messages as seen (prevent re-processing) ───────────────────────────
// We use the exchange ACK pattern — once Harvey emits [ACK] or [REVIEW_REQUEST],
// those exchange_ids will no longer appear as "pending for harvey" because
// getPendingFor() filters out ACK'd exchanges.

// ─── Startup ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[Harvey] Responder started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);

  // Initial run
  await pollAndRespond().catch(err =>
    console.error('[Harvey] Poll error:', err)
  );

  // Recurring poll
  setInterval(async () => {
    await pollAndRespond().catch(err =>
      console.error('[Harvey] Poll error:', err)
    );
  }, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('[Harvey] Fatal error:', err);
  process.exit(1);
});
