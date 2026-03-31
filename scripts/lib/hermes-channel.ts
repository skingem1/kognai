/**
 * hermes-channel.ts — Hermes Protocol inter-agent message bus
 *
 * Implements the four-marker Hermes protocol for Kognai agent coordination:
 *   [REVIEW_REQUEST]   — Harvey → Sherlock: "review this sprint output"
 *   [STATUS_REQUEST]   — Sherlock → named agent: "give me your status"
 *   [ESCALATION_NOTICE]— Sherlock → KognaiBot → Godman: "human required"
 *   [ACK]              — terminal marker, closes the exchange
 *
 * Exchange rules:
 *   - Max 3 messages per exchange (UUID-grouped)
 *   - [ACK] immediately terminates the exchange at any position
 *   - If message 3 is not an [ACK], the exchange auto-escalates
 *
 * TICKET-032-A · Sprint A · Ratified 2026-03-31
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HermesMarker =
  | '[STATUS_REQUEST]'
  | '[REVIEW_REQUEST]'
  | '[ESCALATION_NOTICE]'
  | '[ACK]';

export interface HermesMessage {
  from_agent: string;
  to_agent:   string;
  marker:     HermesMarker;
  message?:   string;
  exchange_id: string;
}

export interface ParsedMarker {
  marker:    HermesMarker;
  to_agent?: string;   // extracted from [STATUS_REQUEST to="agent"]
  body?:     string;   // text following the marker on the same line
}

// ─── Regex patterns ───────────────────────────────────────────────────────────

const MARKER_RE = /\[(STATUS_REQUEST(?:\s+to="([^"]+)")?|REVIEW_REQUEST|ESCALATION_NOTICE|ACK)\]([^\n]*)?/g;

// ─── parseMarkers ─────────────────────────────────────────────────────────────

/**
 * Extract all Hermes markers from a block of agent output text.
 * Supports the optional `to="agent"` attribute on STATUS_REQUEST.
 */
export function parseMarkers(text: string): ParsedMarker[] {
  const results: ParsedMarker[] = [];
  let match: RegExpExecArray | null;
  MARKER_RE.lastIndex = 0;

  while ((match = MARKER_RE.exec(text)) !== null) {
    const full    = match[1];  // e.g. "STATUS_REQUEST to=\"macgyver\""
    const toAgent = match[2];  // captured group inside to="..."
    const body    = match[3]?.trim() || undefined;

    let marker: HermesMarker;
    if (full.startsWith('STATUS_REQUEST'))    marker = '[STATUS_REQUEST]';
    else if (full === 'REVIEW_REQUEST')        marker = '[REVIEW_REQUEST]';
    else if (full === 'ESCALATION_NOTICE')     marker = '[ESCALATION_NOTICE]';
    else                                       marker = '[ACK]';

    results.push({ marker, to_agent: toAgent, body });
  }

  return results;
}

// ─── HermesChannel ────────────────────────────────────────────────────────────

export class HermesChannel {
  private supabase: SupabaseClient;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl ?? process.env.SUPABASE_URL ?? '';
    const key = supabaseKey ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
    this.supabase = createClient(url, key);
  }

  // ── post ──────────────────────────────────────────────────────────────────

  /**
   * Insert a Hermes message into sherlock_channel.
   * Enforces ACK termination and max-3-messages-per-exchange.
   * Returns the inserted row id, or null if the exchange was already closed.
   */
  async post(msg: HermesMessage): Promise<number | null> {
    // 1. Check if exchange is already closed (has an ACK)
    const last = await this.getLastInExchange(msg.exchange_id);
    if (last?.marker === '[ACK]') {
      console.warn(`[Hermes] Exchange ${msg.exchange_id} already closed with [ACK]. Dropping message.`);
      return null;
    }

    // 2. Enforce max 3 messages per exchange
    const count = await this.countInExchange(msg.exchange_id);
    if (count >= 3) {
      // Auto-escalate: exchange exceeded limit without ACK
      console.warn(`[Hermes] Exchange ${msg.exchange_id} hit 3-message limit without ACK. Auto-escalating.`);
      await this._autoEscalate(msg);
      return null;
    }

    // 3. Insert
    const { data, error } = await this.supabase
      .from('sherlock_channel')
      .insert({
        from_agent:  msg.from_agent,
        to_agent:    msg.to_agent,
        marker:      msg.marker,
        message:     msg.message ?? null,
        exchange_id: msg.exchange_id,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Hermes] Insert error:', error.message);
      return null;
    }

    return data?.id ?? null;
  }

  // ── getPendingFor ─────────────────────────────────────────────────────────

  /**
   * Return all unacknowledged messages addressed to a given agent.
   * "Unacknowledged" = the exchange_id does NOT have a corresponding [ACK] row.
   */
  async getPendingFor(agent: string): Promise<HermesMessage[]> {
    const { data, error } = await this.supabase
      .from('sherlock_channel')
      .select('*')
      .eq('to_agent', agent)
      .order('timestamp', { ascending: true });

    if (error || !data) return [];

    // Filter out exchanges that are already ACK'd
    const ackedExchanges = new Set(
      data.filter(r => r.marker === '[ACK]').map(r => r.exchange_id)
    );

    return data
      .filter(r => r.marker !== '[ACK]' && !ackedExchanges.has(r.exchange_id))
      .map(r => ({
        from_agent:  r.from_agent,
        to_agent:    r.to_agent,
        marker:      r.marker as HermesMarker,
        message:     r.message,
        exchange_id: r.exchange_id,
      }));
  }

  // ── getLastInExchange ─────────────────────────────────────────────────────

  /**
   * Return the most recent message in an exchange (to check for ACK).
   */
  async getLastInExchange(exchangeId: string): Promise<HermesMessage | null> {
    const { data, error } = await this.supabase
      .from('sherlock_channel')
      .select('*')
      .eq('exchange_id', exchangeId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      from_agent:  data.from_agent,
      to_agent:    data.to_agent,
      marker:      data.marker as HermesMarker,
      message:     data.message,
      exchange_id: data.exchange_id,
    };
  }

  // ── countInExchange ───────────────────────────────────────────────────────

  /**
   * Count total messages in an exchange.
   */
  async countInExchange(exchangeId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('sherlock_channel')
      .select('*', { count: 'exact', head: true })
      .eq('exchange_id', exchangeId);

    if (error) return 0;
    return count ?? 0;
  }

  // ── emitFromText ──────────────────────────────────────────────────────────

  /**
   * Parse all Hermes markers from a block of agent output text and
   * post each to the channel. Creates a new exchange_id per call unless
   * one is supplied.
   *
   * Returns the exchange_id used (useful for chaining replies).
   */
  async emitFromText(
    text:       string,
    fromAgent:  string,
    defaultTo:  string,
    exchangeId?: string,
  ): Promise<string> {
    const xid    = exchangeId ?? randomUUID();
    const parsed = parseMarkers(text);

    for (const p of parsed) {
      await this.post({
        from_agent:  fromAgent,
        to_agent:    p.to_agent ?? defaultTo,
        marker:      p.marker,
        message:     p.body,
        exchange_id: xid,
      });
    }

    return xid;
  }

  // ── _autoEscalate ─────────────────────────────────────────────────────────

  private async _autoEscalate(triggeredBy: HermesMessage): Promise<void> {
    const escalationMsg: HermesMessage = {
      from_agent:  'hermes-channel',
      to_agent:    'godman',
      marker:      '[ESCALATION_NOTICE]',
      message:     `Exchange ${triggeredBy.exchange_id} exceeded 3-message limit without ACK. ` +
                   `Last sender: ${triggeredBy.from_agent}. Manual intervention required.`,
      exchange_id: randomUUID(),
    };

    await this.supabase.from('sherlock_channel').insert(escalationMsg);
  }

  // ── processOutput (TICKET-032-C) ──────────────────────────────────────────

  /**
   * Parse Hermes markers from a block of agent output text and post each to
   * sherlock_channel.  Returns the exchange_id(s) created.
   *
   * Used by post-sprint-governance.ts after every sprint execution.
   */
  async processOutput(text: string, fromAgent: string, sprintId: string): Promise<string[]> {
    const parsed = parseMarkers(text);
    if (parsed.length === 0) return [];

    const exchangeId = randomUUID();
    for (const p of parsed) {
      await this.post({
        from_agent:  fromAgent,
        to_agent:    p.to_agent ?? (p.marker === '[ESCALATION_NOTICE]' ? 'godman' : 'sherlock'),
        marker:      p.marker,
        message:     [p.body, `sprint:${sprintId}`].filter(Boolean).join(' | ') || undefined,
        exchange_id: exchangeId,
      });
    }

    return [exchangeId];
  }

  // ── syncACPScores (TICKET-032-C) ──────────────────────────────────────────

  /**
   * Mirror composite ACP trust scores from acp/trust-scores.json into the
   * acp_scores Supabase table (idempotent upsert).
   *
   * Called by post-sprint-governance.ts after each sprint.
   */
  async syncACPScores(): Promise<void> {
    if (!process.env.SUPABASE_URL) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodePath = require('path');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const trustFile = nodePath.resolve(process.cwd(), 'acp/trust-scores.json');
    if (!fs.existsSync(trustFile)) return;

    let scores: Record<string, { composite?: number }>;
    try {
      const raw = JSON.parse(fs.readFileSync(trustFile, 'utf-8'));
      scores = raw.scores ?? {};
    } catch {
      return;
    }

    const rows = Object.entries(scores)
      .filter(([, v]) => typeof (v as { composite?: number })?.composite === 'number')
      .map(([agentName, v]) => ({
        agent_name:  agentName,
        sprint_id:   'ACP-SYNC',
        score:       (v as { composite: number }).composite,
        gate_passed: (v as { composite: number }).composite >= 60,
        notes:       'Synced from acp/trust-scores.json',
      }));

    if (rows.length === 0) return;

    // Batch upsert in chunks of 20
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const { error } = await this.supabase
        .from('acp_scores')
        .upsert(batch, { onConflict: 'agent_name,sprint_id', ignoreDuplicates: true });
      if (error) console.warn('[Hermes] syncACPScores upsert error:', error.message);
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────────────────
export const hermesChannel = new HermesChannel();
