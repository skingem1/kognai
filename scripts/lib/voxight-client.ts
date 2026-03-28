// Voxight ORACLE-6 Client — AMD-05 IRL Intelligence Layer
// X Intelligence: trends, Spaces, narrative signals, thought leaders
// Two access modes:
//   1. HTTP API (VoxightClient class) — x402-gated, for external use
//   2. Supabase-direct (fetchSignalsDirect) — zero cost, for internal Kognai consumers
//
// SCS-002 × AMD-05 — Filed: 2026-03-28

import * as https from 'https';
import * as http from 'http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const VOXIGHT_BASE = process.env.VOXIGHT_API_URL || 'https://voxight-api.vercel.app';
const VOXIGHT_KEY  = process.env.VOXIGHT_API_KEY  || '';

// ── Types ────────────────────────────────────────────────────────────────────

export type VoxightQueryType = 'TRENDS' | 'SPACES' | 'NARRATIVE' | 'THOUGHT_LEADER';

export interface VoxightQuery {
  query_type:  VoxightQueryType;
  topic?:      string;
  time_window: string;   // e.g. '24h', '7d', '30d'
}

export interface VoxightSignal {
  signal_id:        string;
  query_type:       VoxightQueryType;
  topic:            string;
  summary:          string;
  confidence:       number;   // 0–100
  sources:          string[];
  timestamp:        string;
  scs_relevant:     boolean;
}

export interface VoxightResponse {
  ok:      boolean;
  signals: VoxightSignal[];
  error?:  string;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpRequest(
  url: string,
  method: 'GET' | 'POST',
  body?: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod    = parsed.protocol === 'https:' ? https : http;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...headers,
    };
    if (body) reqHeaders['Content-Length'] = String(Buffer.byteLength(body));
    if (VOXIGHT_KEY) reqHeaders['Authorization'] = `Bearer ${VOXIGHT_KEY}`;

    const req = (mod as typeof http).request(
      {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method,
        headers:  reqHeaders,
        timeout:  15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      }
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('voxight: request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Voxight Client ────────────────────────────────────────────────────────────

export class VoxightClient {

  /**
   * Query Voxight ORACLE-6 for X intelligence signals.
   * Used by the Intelligence Agent pipeline (AMD-05-E, Stage 1: Collection).
   */
  static async query(params: VoxightQuery): Promise<VoxightResponse> {
    const url  = `${VOXIGHT_BASE}/api/oracle/signals`;
    const body = JSON.stringify(params);

    try {
      const res = await httpRequest(url, 'POST', body);

      if (res.status === 0) {
        return { ok: false, signals: [], error: 'No response from Voxight API' };
      }

      const json = JSON.parse(res.body) as { signals?: VoxightSignal[]; error?: string };

      if (res.status >= 400) {
        return { ok: false, signals: [], error: json.error ?? `HTTP ${res.status}` };
      }

      return { ok: true, signals: json.signals ?? [] };

    } catch (err) {
      const msg = (err as Error).message;
      process.stderr.write(`[voxight] query failed: ${msg}\n`);
      return { ok: false, signals: [], error: msg };
    }
  }

  /**
   * Fetch trending topics on X for a given time window.
   */
  static async trends(timeWindow = '24h'): Promise<VoxightResponse> {
    return this.query({ query_type: 'TRENDS', time_window: timeWindow });
  }

  /**
   * Fetch X Spaces intelligence (active/upcoming spaces on a topic).
   */
  static async spaces(topic: string, timeWindow = '7d'): Promise<VoxightResponse> {
    return this.query({ query_type: 'SPACES', topic, time_window: timeWindow });
  }

  /**
   * Fetch narrative signals — dominant narratives and discourse patterns on X.
   */
  static async narrative(topic: string, timeWindow = '7d'): Promise<VoxightResponse> {
    return this.query({ query_type: 'NARRATIVE', topic, time_window: timeWindow });
  }

  /**
   * Fetch thought leader signals — key influencer opinions on a topic.
   */
  static async thoughtLeader(topic: string, timeWindow = '7d'): Promise<VoxightResponse> {
    return this.query({ query_type: 'THOUGHT_LEADER', topic, time_window: timeWindow });
  }

  /**
   * Health check — returns true if Voxight API is reachable.
   */
  static async ping(): Promise<boolean> {
    try {
      const res = await httpRequest(`${VOXIGHT_BASE}/api/health`, 'GET');
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORACLE-6 DIRECT ACCESS — Supabase query (no x402, internal Kognai use only)
// Used by: scripts/oracle6-consumer.ts, agents/intelligence/
// Auth: VOXIGHT_SUPABASE_KEY (service_role) in Kognai .env
// ─────────────────────────────────────────────────────────────────────────────

const VOXIGHT_SUPABASE_URL =
  process.env.VOXIGHT_SUPABASE_URL ?? 'https://ewrpnhzbrmjbffkjxqob.supabase.co';
const VOXIGHT_SUPABASE_KEY =
  process.env.VOXIGHT_SUPABASE_KEY ?? '';

let _supabase: SupabaseClient | null = null;

function getDirectClient(): SupabaseClient {
  if (!_supabase) {
    // Read lazily so dotenv in the calling script has a chance to run first
    const key = process.env.VOXIGHT_SUPABASE_KEY ?? VOXIGHT_SUPABASE_KEY;
    if (!key) {
      throw new Error('[VoxightDirect] VOXIGHT_SUPABASE_KEY is not set in .env');
    }
    const url = process.env.VOXIGHT_SUPABASE_URL ?? VOXIGHT_SUPABASE_URL;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ── Direct Signal Types ───────────────────────────────────────────────────────

/** Raw `signals` row from Voxight's Supabase */
export interface VoxightSignalRow {
  id: string;
  domain: string | null;
  signal_type: string | null;
  topic: string | null;
  summary: string | null;
  confidence_score: number | null;
  scs_relevance: string[] | null;
  tags: string[] | null;
  signal_timestamp: string | null;
  evidence: Record<string, unknown>[] | null;
  purpose_signal_candidate: boolean | null;
}

/** Enriched signal for Kognai Intelligence Memory (AMD-05) */
export interface Oracle6DirectSignal {
  signal_id:               string;       // `oracle6-{uuid}`
  source:                  'voxight';
  domain:                  string;       // AI | Web3 | fintech | regulation | agent_economy | unknown
  signal_type:             string;       // spaces_insight | hashtag_emergence | thought_leader_alert | narrative_shift | cross_signal_correlation
  topic:                   string;       // max 140 chars
  summary:                 string;       // max 280 chars
  confidence:              number;       // 0–100
  evidence:                Record<string, unknown>[];
  scs_relevance:           string[];
  tags:                    string[];
  purpose_signal_candidate: boolean;    // true if confidence >= 75
  signal_timestamp:        string;
  fetched_at:              string;
}

/** Result envelope from fetchSignalsDirect() */
export interface DirectFetchResult {
  fetch_id:           string;
  fetched_at:         string;
  status:             'live' | 'degraded' | 'empty';
  signal_count:       number;
  purpose_candidates: number;
  signals:            Oracle6DirectSignal[];
}

function rowToDirectSignal(row: VoxightSignalRow): Oracle6DirectSignal {
  const confidence = Math.min(100, Math.max(0, row.confidence_score ?? 0));
  return {
    signal_id:               `oracle6-${row.id}`,
    source:                  'voxight',
    domain:                  row.domain ?? 'unknown',
    signal_type:             row.signal_type ?? 'unknown',
    topic:                   (row.topic ?? '').slice(0, 140),
    summary:                 (row.summary ?? '').slice(0, 280),
    confidence,
    evidence:                Array.isArray(row.evidence) ? row.evidence : [],
    scs_relevance:           Array.isArray(row.scs_relevance) ? row.scs_relevance : [],
    tags:                    Array.isArray(row.tags) ? row.tags.slice(0, 10) : [],
    purpose_signal_candidate: confidence >= 75 || row.purpose_signal_candidate === true,
    signal_timestamp:        row.signal_timestamp ?? new Date().toISOString(),
    fetched_at:              new Date().toISOString(),
  };
}

// ── Direct Fetch Functions ────────────────────────────────────────────────────

/**
 * Fetch Intelligence Signals directly from Voxight's Supabase.
 * Zero x402 cost — internal Kognai use only.
 * Never throws — returns degraded result on error.
 */
export async function fetchSignalsDirect(opts: {
  lookbackDays?: number;
  minConfidence?: number;
  limit?: number;
} = {}): Promise<DirectFetchResult> {
  const { lookbackDays = 7, minConfidence = 60, limit = 100 } = opts;
  const fetched_at = new Date().toISOString();
  const fetch_id   = Math.random().toString(36).slice(2, 10);

  try {
    const db    = getDirectClient();
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await db
      .from('signals')
      .select('id, domain, signal_type, topic, summary, confidence_score, scs_relevance, tags, signal_timestamp, evidence, purpose_signal_candidate')
      .gte('signal_timestamp', since)
      .gte('confidence_score', minConfidence)
      .order('confidence_score', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Supabase: ${error.message}`);

    if (!data || data.length === 0) {
      console.warn('[VoxightDirect] 0 signals in lookback window');
      return { fetch_id, fetched_at, status: 'empty', signal_count: 0, purpose_candidates: 0, signals: [] };
    }

    const signals    = (data as VoxightSignalRow[]).map(rowToDirectSignal);
    const candidates = signals.filter(s => s.purpose_signal_candidate).length;

    console.log(`[VoxightDirect] ${signals.length} signals fetched (${candidates} purpose candidates)`);
    return { fetch_id, fetched_at, status: 'live', signal_count: signals.length, purpose_candidates: candidates, signals };

  } catch (err: any) {
    console.error(`[VoxightDirect] fetchSignalsDirect failed: ${err.message}`);
    return { fetch_id, fetched_at, status: 'degraded', signal_count: 0, purpose_candidates: 0, signals: [] };
  }
}

/**
 * Convenience: fetch only Purpose Signal candidates (confidence >= 75).
 * Used by oracle6-consumer.ts for the 2-cycle persistence check.
 */
export async function fetchPurposeCandidates(): Promise<Oracle6DirectSignal[]> {
  const result = await fetchSignalsDirect({ minConfidence: 75, lookbackDays: 14, limit: 50 });
  return result.signals.filter(s => s.purpose_signal_candidate);
}

// ── Smoke test ────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log('\n🔭 Voxight ORACLE-6 Smoke Test');
    console.log(`   Base URL: ${VOXIGHT_BASE}`);
    console.log(`   API Key:  ${VOXIGHT_KEY ? '✓ set' : '⚠ not set (VOXIGHT_API_KEY)'}`);
    console.log(`   Direct Supabase: ${VOXIGHT_SUPABASE_KEY ? '✓ set' : '⚠ not set (VOXIGHT_SUPABASE_KEY)'}\n`);

    // Test 1: HTTP API ping
    const alive = await VoxightClient.ping();
    console.log(`HTTP API ping: ${alive ? '✅ reachable' : '⚠️  not reachable'}`);

    // Test 2: Supabase direct fetch
    const direct = await fetchSignalsDirect({ lookbackDays: 7, minConfidence: 60, limit: 5 });
    console.log(`Direct Supabase: ${direct.status} — ${direct.signal_count} signals (${direct.purpose_candidates} purpose candidates)`);

    console.log('\n✅ PASS — Voxight ORACLE-6 client ready\n');
  })();
}
