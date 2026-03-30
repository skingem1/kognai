/**
 * Hermes Protocol v1.0 — Inter-agent coordination markers
 * Sprint TICKET-032-A · 2026-03-30
 *
 * 4 markers that agents embed in output text to signal coordination events:
 *   [STATUS_REQUEST]   — asking another agent for a status update
 *   [REVIEW_REQUEST]   — requesting Sherlock peer review on completed work
 *   [ESCALATION_NOTICE]— elevating unresolved issue to Godman (human) or higher tier
 *   [ACK]              — acknowledging & closing an exchange (terminal marker)
 *
 * Exchange rules:
 *   • Each exchange has a unique ID and at most 3 messages (sequence 1→2→3)
 *   • The moment an ACK is sent the exchange status becomes "acked" (no further msgs)
 *   • If sequence 3 is not ACK the exchange becomes "escalated"
 *   • Exchanges not resolved within 24h become "expired"
 *
 * Closes GAP-06: self-healing supervisor coordination layer.
 */

import { randomUUID } from 'crypto';

// ── Marker definitions ────────────────────────────────────────────────────────

export const HERMES_MARKERS = [
  'STATUS_REQUEST',
  'REVIEW_REQUEST',
  'ESCALATION_NOTICE',
  'ACK',
] as const;

export type HermesMarker = typeof HERMES_MARKERS[number];

// ── Core types ─────────────────────────────────────────────────────────────────

export interface HermesMessage {
  exchange_id: string;
  sequence: 1 | 2 | 3;
  from_agent: string;
  to_agent: string;
  marker: HermesMarker;
  payload: string;       // text after the marker tag (trimmed)
  sprint_id?: string;
  created_at: string;    // ISO 8601
}

export type ExchangeStatus = 'open' | 'acked' | 'escalated' | 'expired';

export interface HermesExchange {
  exchange_id: string;
  status: ExchangeStatus;
  messages: HermesMessage[];
  opened_at: string;
  closed_at?: string;
  initiating_sprint?: string;
}

export interface ParsedMarker {
  marker: HermesMarker;
  to_agent: string;     // extracted from tag or inferred from marker type
  payload: string;
  raw_match: string;
}

// ── Marker inference ──────────────────────────────────────────────────────────

/** Default routing for each marker type when no explicit to= is found */
const DEFAULT_TO: Record<HermesMarker, string> = {
  STATUS_REQUEST:    'sherlock',
  REVIEW_REQUEST:    'sherlock',
  ESCALATION_NOTICE: 'godman',
  ACK:               'sherlock',
};

// Regex: matches [MARKER_TYPE to="agent"] or [MARKER_TYPE] with optional attrs
const MARKER_RE =
  /\[(STATUS_REQUEST|REVIEW_REQUEST|ESCALATION_NOTICE|ACK)(?:\s+[^\]]*?)?\]([ \t]*)(.*?)(?=\[(?:STATUS_REQUEST|REVIEW_REQUEST|ESCALATION_NOTICE|ACK)|\n\n|$)/gis;

// Attr extractor: [MARKER to="agent"] → agent
const TO_ATTR_RE = /\bto=["']?(\w[\w-]*)["']?/i;

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Scan agent output text for embedded Hermes markers.
 * Returns ordered list of detected markers, ready to create HermesMessages.
 */
export function parseHermesMarkers(text: string): ParsedMarker[] {
  const found: ParsedMarker[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex
  MARKER_RE.lastIndex = 0;

  while ((match = MARKER_RE.exec(text)) !== null) {
    const markerStr = match[1].toUpperCase() as HermesMarker;
    const fullTag = match[0].slice(0, match[0].indexOf(']') + 1); // just the [TAG] part
    const payload = match[3]?.trim() ?? '';

    // Extract explicit to= from the tag attrs
    const toMatch = TO_ATTR_RE.exec(fullTag);
    const toAgent = toMatch ? toMatch[1].toLowerCase() : DEFAULT_TO[markerStr];

    found.push({
      marker: markerStr,
      to_agent: toAgent,
      payload,
      raw_match: match[0],
    });
  }

  return found;
}

// ── Exchange state machine ────────────────────────────────────────────────────

/** Create a brand-new exchange from the first message */
export function openExchange(
  msg: Omit<HermesMessage, 'exchange_id' | 'sequence'>,
  sprintId?: string,
): HermesExchange {
  const exchange_id = randomUUID();
  const firstMsg: HermesMessage = { ...msg, exchange_id, sequence: 1 };
  return {
    exchange_id,
    status: msg.marker === 'ACK' ? 'acked' : 'open',
    messages: [firstMsg],
    opened_at: firstMsg.created_at,
    closed_at: msg.marker === 'ACK' ? firstMsg.created_at : undefined,
    initiating_sprint: sprintId,
  };
}

/** Append a message to an existing open exchange. Returns updated exchange. */
export function continueExchange(
  exchange: HermesExchange,
  msg: Omit<HermesMessage, 'exchange_id' | 'sequence'>,
): HermesExchange {
  if (exchange.status !== 'open') {
    // Exchange already closed — ignore silently (idempotent)
    return exchange;
  }

  const nextSeq = (exchange.messages.length + 1) as 1 | 2 | 3;
  const newMsg: HermesMessage = { ...msg, exchange_id: exchange.exchange_id, sequence: nextSeq };
  const messages = [...exchange.messages, newMsg];

  let status: ExchangeStatus = 'open';
  let closed_at: string | undefined;

  if (msg.marker === 'ACK') {
    status = 'acked';
    closed_at = newMsg.created_at;
  } else if (nextSeq === 3) {
    // Reached message limit without ACK → escalate
    status = 'escalated';
    closed_at = newMsg.created_at;
  }

  return { ...exchange, messages, status, closed_at };
}

/** Returns true if the exchange cannot accept more messages */
export function isTerminal(exchange: HermesExchange): boolean {
  return exchange.status !== 'open';
}

/** Build a new HermesMessage from a ParsedMarker */
export function buildMessage(
  parsed: ParsedMarker,
  fromAgent: string,
  sprintId?: string,
): Omit<HermesMessage, 'exchange_id' | 'sequence'> {
  return {
    from_agent: fromAgent,
    to_agent: parsed.to_agent,
    marker: parsed.marker,
    payload: parsed.payload,
    sprint_id: sprintId,
    created_at: new Date().toISOString(),
  };
}
