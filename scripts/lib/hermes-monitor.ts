/**
 * hermes-monitor.ts — Supabase Realtime subscriber for Hermes Protocol events
 *
 * Subscribes to INSERT events on sherlock_channel and reacts:
 *   [ESCALATION_NOTICE] → apply ACP score penalty + send Telegram alert
 *   [REVIEW_REQUEST]    → log (sherlock-cron handles the response)
 *   [ACK]               → log exchange closure
 *   [STATUS_REQUEST]    → log
 *
 * Also does an initial syncACPScores() on startup to push any pending score
 * deltas from acp/trust-scores.json into Supabase.
 *
 * TICKET-032-C · Sprint C · Ratified 2026-03-31
 *
 * Run via PM2:
 *   pm2 start ecosystem.config.js --only hermes-monitor
 */

import { createClient } from '@supabase/supabase-js';
import { hermesChannel } from './hermes-channel';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[HermesMonitor] SUPABASE_URL / SUPABASE_KEY not set. Exiting.');
  process.exit(1);
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   ?? '';

// ACP score penalty applied per escalation event
const ESCALATION_PENALTY = 5;

// ─── Supabase client (with Realtime) ──────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ─── Telegram helper ──────────────────────────────────────────────────────────

async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const url  = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body = JSON.stringify({
      chat_id:    TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[HermesMonitor] Telegram send failed:', err);
    }
  } catch (e) {
    console.warn('[HermesMonitor] Telegram error:', (e as Error).message);
  }
}

// ─── ACP penalty helper ───────────────────────────────────────────────────────

async function applyEscalationPenalty(fromAgent: string, exchangeId: string): Promise<void> {
  const { error } = await supabase
    .from('acp_scores')
    .upsert(
      {
        agent_name:  fromAgent,
        sprint_id:   `ESC-${exchangeId.slice(0, 8)}`,
        score:       Math.max(0, 50 - ESCALATION_PENALTY), // conservative base; real score tracked in trust-scores.json
        gate_passed: false,
        notes:       `Auto-penalty: [ESCALATION_NOTICE] in exchange ${exchangeId}`,
      },
      { onConflict: 'agent_name,sprint_id', ignoreDuplicates: true },
    );

  if (error) {
    console.warn('[HermesMonitor] ACP penalty upsert error:', error.message);
  } else {
    console.log(`[HermesMonitor] ACP penalty recorded for agent: ${fromAgent}`);
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

interface ChannelRow {
  id:          number;
  from_agent:  string;
  to_agent:    string;
  marker:      string;
  message:     string | null;
  exchange_id: string;
  timestamp:   string;
}

async function handleInsert(row: ChannelRow): Promise<void> {
  const ts   = new Date().toISOString();
  const from = row.from_agent;
  const to   = row.to_agent;
  const xid  = row.exchange_id.slice(0, 8);

  switch (row.marker) {
    case '[ESCALATION_NOTICE]': {
      console.log(`[HermesMonitor] ${ts} ESCALATION from=${from} to=${to} xid=${xid}`);

      await applyEscalationPenalty(from, row.exchange_id);

      const alertText =
        `⚠️ <b>Hermes Escalation</b>\n` +
        `Agent: <code>${from}</code> → <code>${to}</code>\n` +
        `Exchange: <code>${row.exchange_id}</code>\n` +
        `Message: ${row.message ?? '(none)'}\n` +
        `Time: ${ts}`;
      await sendTelegram(alertText);
      break;
    }

    case '[REVIEW_REQUEST]': {
      console.log(`[HermesMonitor] ${ts} REVIEW_REQUEST from=${from} to=${to} xid=${xid}`);
      // sherlock-cron.ts handles responses; monitor just logs
      break;
    }

    case '[STATUS_REQUEST]': {
      console.log(`[HermesMonitor] ${ts} STATUS_REQUEST from=${from} to=${to} xid=${xid}`);
      break;
    }

    case '[ACK]': {
      console.log(`[HermesMonitor] ${ts} ACK — exchange ${xid} closed. from=${from}`);
      break;
    }

    default:
      console.warn(`[HermesMonitor] Unknown marker: ${row.marker}`);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[HermesMonitor] Starting up…');

  // Initial ACP sync: push trust-scores.json → acp_scores table
  await hermesChannel.syncACPScores();
  console.log('[HermesMonitor] Initial ACP sync complete.');

  // Subscribe to Realtime inserts on sherlock_channel
  const channel = supabase
    .channel('hermes-monitor-channel')
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'sherlock_channel',
      },
      (payload) => {
        const row = payload.new as ChannelRow;
        handleInsert(row).catch((err) =>
          console.error('[HermesMonitor] handleInsert error:', err),
        );
      },
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[HermesMonitor] Realtime subscribed to sherlock_channel ✓');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[HermesMonitor] Subscription error:', status, err?.message);
      }
    });

  // Keep the process alive
  process.on('SIGTERM', async () => {
    console.log('[HermesMonitor] SIGTERM received — unsubscribing…');
    await supabase.removeChannel(channel);
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[HermesMonitor] SIGINT received — unsubscribing…');
    await supabase.removeChannel(channel);
    process.exit(0);
  });

  console.log('[HermesMonitor] Listening for sherlock_channel events…');
}

main().catch((err) => {
  console.error('[HermesMonitor] Fatal:', err);
  process.exit(1);
});
