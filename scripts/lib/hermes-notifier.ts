/**
 * Hermes Notifier — Telegram bridge for Hermes Protocol
 * Sprint TICKET-032-B · 2026-03-30
 *
 * Sends fire-and-forget Telegram notifications to Godman when:
 *   - A new ESCALATION_NOTICE, REVIEW_REQUEST, or STATUS_REQUEST exchange opens
 *   - An exchange becomes 'escalated' (3 messages, no ACK — manual review required)
 *   - An exchange receives ACK and closes cleanly
 *
 * Notification rules:
 *   ESCALATION_NOTICE (open)  → 🚨 immediate alert (highest priority)
 *   REVIEW_REQUEST (open)     → 🔍 review needed
 *   STATUS_REQUEST (open)     → ℹ️  status check in progress
 *   ACK as first message      → silent (no human action needed)
 *   status = 'acked'          → ✅ light close notification
 *   status = 'escalated'      → ⚠️ urgent — 3 messages without resolution
 *
 * Non-blocking: errors are silently ignored. Never crashes the caller.
 * Uses same env vars as ceo-wallet.ts:
 *   TELEGRAM_BOT_TOKEN | CEO_TELEGRAM_BOT_TOKEN
 *   OWNER_TELEGRAM_CHAT_ID | CEO_TELEGRAM_CHAT_ID
 */

import * as https from 'https';
import type { HermesExchange } from './hermes-protocol';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fire-and-forget Telegram sendMessage to Godman's chat. Never throws. */
function sendToGodman(text: string): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.CEO_TELEGRAM_BOT_TOKEN || '';
  const chatId   = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.CEO_TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) return; // silently skip if not configured

  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  const req = https.request({
    hostname: 'api.telegram.org',
    path:     `/bot${botToken}/sendMessage`,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  });
  req.on('error', () => {}); // fire-and-forget, never crash
  req.write(payload);
  req.end();
}

/** Convert MARKER_TYPE → human-readable "Marker Type" */
function titleCase(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Truncate long payloads for Telegram readability */
function truncate(s: string, max = 300): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ── Emoji map ──────────────────────────────────────────────────────────────────

const MARKER_EMOJI: Record<string, string> = {
  ESCALATION_NOTICE: '🚨',
  REVIEW_REQUEST:    '🔍',
  STATUS_REQUEST:    'ℹ️',
  ACK:               '✅',
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Notify Godman when a new Hermes exchange is opened (first message).
 * Called by HermesChannel.writeOpen().
 *
 * ACK-only exchanges are silent (system-level bookkeeping, no human action needed).
 */
export function notifyOnOpen(exchange: HermesExchange): void {
  const msg = exchange.messages[0];
  if (!msg) return;

  // ACK as first message = immediate close, no notification needed
  if (msg.marker === 'ACK') return;

  const emoji  = MARKER_EMOJI[msg.marker] ?? '📡';
  const sprint = msg.sprint_id ? `\`${msg.sprint_id}\`` : '_unknown sprint_';
  const xid    = `\`${exchange.exchange_id.slice(0, 8)}...\``;
  const body   = msg.payload ? truncate(msg.payload) : '';

  const lines = [
    `${emoji} *Hermes ${titleCase(msg.marker)}*`,
    `Sprint: ${sprint}`,
    `From: \`${msg.from_agent}\` → \`${msg.to_agent}\``,
    `Exchange: ${xid}`,
  ];

  if (body) {
    lines.push('', body);
  }

  sendToGodman(lines.join('\n'));
}

/**
 * Notify Godman when an exchange changes to a terminal status.
 * Called by HermesChannel.writeContinue().
 *
 * Only fires when status transitions away from 'open':
 *   'acked'     → ✅ clean close
 *   'escalated' → ⚠️ unresolved after 3 messages
 */
export function notifyOnStatusChange(exchange: HermesExchange): void {
  if (exchange.status === 'open') return; // intermediate message, no notification

  const lastMsg = exchange.messages[exchange.messages.length - 1];
  const sprint  = lastMsg?.sprint_id ? `\`${lastMsg.sprint_id}\`` : '_unknown sprint_';
  const xid     = `\`${exchange.exchange_id.slice(0, 8)}...\``;
  const msgCount = exchange.messages.length;

  if (exchange.status === 'acked') {
    const lines = [
      `✅ *Hermes Exchange Closed*`,
      `Sprint: ${sprint}`,
      `ACK from: \`${lastMsg?.from_agent ?? 'unknown'}\``,
      `Exchange: ${xid} (${msgCount} msg${msgCount !== 1 ? 's' : ''})`,
    ];
    sendToGodman(lines.join('\n'));

  } else if (exchange.status === 'escalated') {
    const lines = [
      `⚠️ *Hermes Exchange Escalated*`,
      `Sprint: ${sprint}`,
      `3 messages — no ACK received`,
      `Last from: \`${lastMsg?.from_agent ?? 'unknown'}\` → \`${lastMsg?.to_agent ?? 'unknown'}\``,
      `Exchange: ${xid}`,
      `→ Manual review required`,
    ];
    sendToGodman(lines.join('\n'));
  }
}
