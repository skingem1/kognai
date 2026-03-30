/**
 * Hermes Channel — Persistence layer for Hermes Protocol exchanges
 * Sprint TICKET-032-A · 2026-03-30
 *
 * Storage strategy (layered, both always attempted):
 *   1. Local JSONL  → logs/hermes/YYYY-MM-DD.jsonl  (always available, zero deps)
 *   2. Supabase     → sherlock_channel table         (async, non-blocking, best-effort)
 *
 * The channel is the source of truth for active exchanges.
 * Supabase is the distributed mirror (required for TICKET-032-B Telegram bridge).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  type HermesExchange,
  type HermesMessage,
  type ExchangeStatus,
  continueExchange,
  openExchange,
  isTerminal,
  parseHermesMarkers,
  buildMessage,
} from './hermes-protocol';

const ROOT = join(__dirname, '../..');
const LOG_DIR = join(ROOT, 'logs', 'hermes');

// Re-export types for convenience
export type { HermesExchange, HermesMessage, ExchangeStatus };

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLog(): string {
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(LOG_DIR, { recursive: true });
  return join(LOG_DIR, `${date}.jsonl`);
}

function appendLog(obj: object): void {
  try {
    appendFileSync(todayLog(), JSON.stringify(obj) + '\n');
  } catch { /* non-blocking */ }
}

/** Load all exchanges from a single JSONL day file */
function loadDayFile(filePath: string): HermesExchange[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  const map = new Map<string, HermesExchange>();

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as { type: 'message'; exchange: HermesExchange };
      if (record.type === 'message' && record.exchange?.exchange_id) {
        map.set(record.exchange.exchange_id, record.exchange);
      }
    } catch { /* skip malformed */ }
  }

  return Array.from(map.values());
}

// ── Channel class ─────────────────────────────────────────────────────────────

export class HermesChannel {
  /** Write a new exchange-opening message to the channel */
  writeOpen(exchange: HermesExchange): void {
    appendLog({ type: 'message', ts: new Date().toISOString(), exchange });
    this._syncToSupabase(exchange.messages[0], exchange.status).catch(() => {});
  }

  /** Append a continuation message to an existing exchange */
  writeContinue(exchange: HermesExchange, msg: HermesMessage): void {
    appendLog({ type: 'message', ts: new Date().toISOString(), exchange });
    this._syncToSupabase(msg, exchange.status).catch(() => {});
  }

  /** Load all open exchanges from today's log */
  getOpenExchanges(): HermesExchange[] {
    return loadDayFile(todayLog()).filter(e => e.status === 'open');
  }

  /** Retrieve a specific exchange by ID from today's log */
  getExchange(exchange_id: string): HermesExchange | undefined {
    return loadDayFile(todayLog()).find(e => e.exchange_id === exchange_id);
  }

  /**
   * High-level: process agent output text.
   * Detects markers, opens/continues exchanges, writes to log.
   * Returns list of exchanges created or updated.
   */
  processOutput(
    agentOutput: string,
    fromAgent: string,
    sprintId?: string,
  ): HermesExchange[] {
    const markers = parseHermesMarkers(agentOutput);
    if (markers.length === 0) return [];

    const affected: HermesExchange[] = [];

    for (const parsed of markers) {
      const msgBase = buildMessage(parsed, fromAgent, sprintId);
      const exchange = openExchange(msgBase, sprintId);
      this.writeOpen(exchange);
      affected.push(exchange);
    }

    return affected;
  }

  /**
   * Continue an existing exchange with a reply message.
   * Returns the updated exchange (or unchanged if already terminal).
   */
  reply(
    exchange_id: string,
    replyBase: Omit<HermesMessage, 'exchange_id' | 'sequence'>,
  ): HermesExchange | null {
    const existing = this.getExchange(exchange_id);
    if (!existing) return null;
    if (isTerminal(existing)) return existing;

    const updated = continueExchange(existing, replyBase);
    const lastMsg = updated.messages[updated.messages.length - 1];
    this.writeContinue(updated, lastMsg);
    return updated;
  }

  /** Async Supabase mirror — non-blocking, errors ignored */
  private async _syncToSupabase(
    msg: HermesMessage,
    exchangeStatus: ExchangeStatus,
  ): Promise<void> {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      await supabase.from('sherlock_channel').upsert({
        exchange_id: msg.exchange_id,
        sequence: msg.sequence,
        from_agent: msg.from_agent,
        to_agent: msg.to_agent,
        marker: msg.marker,
        payload: msg.payload.slice(0, 2000), // guard against huge payloads
        sprint_id: msg.sprint_id ?? null,
        status: exchangeStatus,
        created_at: msg.created_at,
      }, { onConflict: 'exchange_id,sequence' });
    } catch { /* non-blocking */ }
  }

  /** Sync all agent ACP scores to Supabase acp_scores table */
  async syncACPScores(): Promise<void> {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseKey) return;

      const trustPath = join(ROOT, 'acp', 'trust-scores.json');
      if (!existsSync(trustPath)) return;

      const trustData = JSON.parse(readFileSync(trustPath, 'utf-8'));
      const scores = trustData.scores ?? {};

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const rows = Object.entries(scores).map(([agent_id, s]: [string, any]) => ({
        agent_id,
        safety: s.safety ?? 70,
        accuracy: s.accuracy ?? 70,
        brand_alignment: s.brand_alignment ?? 70,
        cultural_sensitivity: s.cultural_sensitivity ?? 70,
        legal_compliance: s.legal_compliance ?? 70,
        psychological_resilience: s.psychological_resilience ?? 70,
        composite: s.composite ?? 70,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        await supabase.from('acp_scores').upsert(rows, { onConflict: 'agent_id' });
      }
    } catch { /* non-blocking */ }
  }
}

/** Module-level singleton */
export const hermesChannel = new HermesChannel();
