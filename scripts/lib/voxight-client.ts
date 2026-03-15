// Voxight ORACLE-6 Client — AMD-05 IRL Intelligence Layer
// X Intelligence: trends, Spaces, narrative signals, thought leaders
// Voxight API (Module 1, LIVE) — configured via VOXIGHT_API_URL env var

import * as https from 'https';
import * as http from 'http';

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

// ── Smoke test ────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log('\n🔭 Voxight ORACLE-6 Smoke Test');
    console.log(`   Base URL: ${VOXIGHT_BASE}`);
    console.log(`   API Key:  ${VOXIGHT_KEY ? '✓ set' : '⚠ not set (VOXIGHT_API_KEY)'}\n`);

    const alive = await VoxightClient.ping();
    if (!alive) {
      console.log('⚠️  Voxight API not reachable — set VOXIGHT_API_URL + VOXIGHT_API_KEY');
      console.log('   (graceful no-op confirmed — Intel Layer will skip ORACLE-6 until configured)\n');
      process.exit(0);
    }

    const res = await VoxightClient.trends('24h');
    if (res.ok) {
      console.log(`✅ trends() → ${res.signals.length} signals`);
    } else {
      console.log(`⚠️  trends() failed: ${res.error}`);
    }

    console.log('\n✅ PASS — Voxight ORACLE-6 client ready\n');
  })();
}
