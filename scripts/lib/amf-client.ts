/**
 * amf-client.ts — Agent Memory Format (AMF) SDK Stub
 * Godman Protocol #4 · v1.0
 *
 * This is the AMF client SDK. All agents that need to read or write
 * persistent memory MUST use this interface. No agent may maintain
 * private persistent state outside AMF.
 *
 * Status: STUB — read/write interfaces defined per §10 of amf_protocol_v1.md
 * Full implementation follows AMD-21 Sprint 520 (ASMR integration).
 *
 * AMF Root (kognai.*): ~/kognai/workspace/memory/amf-records/
 * AMF Root (invoica.*): ~/Documents/Invoica/memory/amf-records/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AMFLayer = 'L1' | 'L2' | 'L3' | 'L4';
export type AMFRetentionTier = 'PERMANENT' | 'WARM' | 'COLD' | 'RENTAL_EXPIRED';

export type AMFMemoryType =
  // L2 Skills
  | 'procedural'
  | 'constitutional'
  // L3 Episodic / Semantic (AMD-02 + AMD-21)
  | 'episodic'
  | 'semantic'
  | 'skill_rental_gotcha'
  | 'skill_rental_learning'
  // L4 Domain Knowledge (AMD-25)
  | 'domain_trading'
  | 'domain_bizdev'
  | 'domain_research'
  | 'domain_content'
  | 'domain_regulatory'
  // Cross-layer
  | 'curation_receipt';

export interface AMFRecord {
  amf_version: '1.0';
  record_id: string;
  agent_id: string;
  session_id: string | null;
  timestamp: string;
  memory_type: AMFMemoryType;
  layer: AMFLayer;
  domain: string;
  content: {
    text: string;         // max 2000 chars
    vectors: null;        // R1: null in v1.0; populated post-AMD-21 Sprint 520
    raw: unknown | null;  // original data for reconstruction
  };
  retention: {
    tier: AMFRetentionTier;
    expires_at: string | null;
    compress_after_days: number | null;
  };
  provenance: {
    source: string;
    source_agent: string;
    swarm_session: string | null;
  };
  constitutional_hash: string;  // SHA-256 of content.text
  acp_score_at_write: number | null;
  provisional: boolean;
}

export interface AMFWriteInput {
  memory_type: AMFMemoryType;
  layer: AMFLayer;
  content: {
    text: string;
    raw?: unknown;
  };
  retention: {
    tier: AMFRetentionTier;
    expires_at?: string;
    compress_after_days?: number;
  };
  provenance?: {
    source?: string;
  };
  session_id?: string;
}

export interface AMFQuery {
  agent_id: string;
  domain: string;
  query: string;
  memory_types?: AMFMemoryType[];
  max_results?: number;
  tier_floor?: 'PERMANENT' | 'WARM' | 'COLD';
}

export interface AMFResult {
  records: AMFRecord[];
  retrieval_tier_used: 'CACHE' | 'FULLTEXT' | 'LLM';
  tokens_used: number;
  cache_hit: boolean;
  query_ms: number;
}

export interface AMFClientConfig {
  agent_id: string;
  domain: string;
  acp_score?: number | null;
  session_id?: string | null;
}

// ─── Domain → File Path Map ───────────────────────────────────────────────────

const KOGNAI_ROOT = path.resolve(process.env.HOME || '~', 'kognai/workspace/memory/amf-records');
const INVOICA_ROOT = path.resolve(process.env.HOME || '~', 'Documents/Invoica/memory/amf-records');

function domainToFilePath(domain: string): string {
  const isInvoica = domain.startsWith('invoica.');
  const root = isInvoica ? INVOICA_ROOT : KOGNAI_ROOT;

  // Map domain codes to file paths
  const pathMap: Record<string, string> = {
    'kognai.soul':           path.join(root, 'L1/soul/soul.jsonl'),
    'kognai.constitution':   path.join(root, 'L1/constitution/constitution.jsonl'),
    'kognai.skills':         path.join(root, 'L2/procedural/skills.jsonl'),
    'kognai.episodic':       path.join(root, `L3/episodic/${new Date().toISOString().slice(0, 10)}.jsonl`),
    'kognai.semantic':       path.join(root, `L3/semantic/${new Date().toISOString().slice(0, 7)}.jsonl`),
    'kognai.dka.trading':    path.join(root, 'L4/trading.jsonl'),
    'kognai.dka.bizdev':     path.join(root, 'L4/bizdev.jsonl'),
    'kognai.dka.research':   path.join(root, 'L4/research.jsonl'),
    'kognai.dka.content':    path.join(root, 'L4/content.jsonl'),
    'kognai.dka.regulatory': path.join(root, 'L4/regulatory.jsonl'),
  };

  return pathMap[domain] ?? path.join(root, `L3/episodic/${domain}.jsonl`);
}

// ─── AMFClient ────────────────────────────────────────────────────────────────

export class AMFClient {
  private agentId: string;
  private domain: string;
  private acpScore: number | null;
  private sessionId: string | null;

  constructor(config: AMFClientConfig) {
    this.agentId = config.agent_id;
    this.domain = config.domain;
    this.acpScore = config.acp_score ?? null;
    this.sessionId = config.session_id ?? null;

    // Enforce partition isolation (R3)
    const isInvoica = this.domain.startsWith('invoica.');
    const isKognai = this.domain.startsWith('kognai.');
    if (!isInvoica && !isKognai) {
      throw new Error(`[AMF] Unknown domain namespace: "${this.domain}". Must be kognai.* or invoica.*`);
    }
  }

  /**
   * Write a memory record through the constitutional filter pipeline (§8).
   * Appends to the domain's JSONL file (append-only).
   */
  async write(input: AMFWriteInput): Promise<AMFRecord> {
    const text = input.content.text.slice(0, 2000);
    const constitutionalHash = crypto.createHash('sha256').update(text).digest('hex');

    // ACP gate (§8 Write Path)
    const acp = this.acpScore;
    let provisional = false;
    if (acp === null) {
      provisional = true; // R4: null-ACP provisional write
    } else if (acp < 40) {
      throw new Error(`[AMF] ACP score ${acp} < 40. Write quarantined. Sherlock clearance required.`);
    } else if (acp < 70) {
      provisional = true;
    }

    const record: AMFRecord = {
      amf_version: '1.0',
      record_id: uuidv4(),
      agent_id: this.agentId,
      session_id: input.session_id ?? this.sessionId,
      timestamp: new Date().toISOString(),
      memory_type: input.memory_type,
      layer: input.layer,
      domain: this.domain,
      content: {
        text,
        vectors: null, // R1: null in v1.0
        raw: input.content.raw ?? null,
      },
      retention: {
        tier: input.retention.tier,
        expires_at: input.retention.expires_at ?? null,
        compress_after_days: input.retention.compress_after_days ?? null,
      },
      provenance: {
        source: input.provenance?.source ?? 'agent_write',
        source_agent: this.agentId,
        swarm_session: this.sessionId,
      },
      constitutional_hash: constitutionalHash,
      acp_score_at_write: acp,
      provisional,
    };

    // Append to JSONL (append-only per spec)
    const filePath = domainToFilePath(this.domain);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');

    return record;
  }

  /**
   * Query memory via three-tier retrieval pipeline (§7).
   *
   * STUB: Full implementation requires AMD-21 (ASMR) for embedding-based Tier 2.
   * This stub implements Tier 1 (substring fulltext) only.
   * Tier 0 (cache) and Tier 2 (nomic-embed-text) added in Sprint 520.
   */
  async query(input: Omit<AMFQuery, 'agent_id' | 'domain'>): Promise<AMFResult> {
    const startMs = Date.now();
    const filePath = domainToFilePath(this.domain);

    if (!fs.existsSync(filePath)) {
      return {
        records: [],
        retrieval_tier_used: 'FULLTEXT',
        tokens_used: 0,
        cache_hit: false,
        query_ms: Date.now() - startMs,
      };
    }

    // Tier 1: naive substring fulltext search (BM25 pending AMD-21)
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const queryLower = input.query.toLowerCase();

    let records: AMFRecord[] = lines
      .map(line => {
        try { return JSON.parse(line) as AMFRecord; }
        catch { return null; }
      })
      .filter((r): r is AMFRecord => r !== null)
      .filter(r => {
        // Apply memory_type filter
        if (input.memory_types && !input.memory_types.includes(r.memory_type)) return false;
        // Apply tier_floor filter
        const tierOrder: AMFRetentionTier[] = ['PERMANENT', 'WARM', 'COLD', 'RENTAL_EXPIRED'];
        if (input.tier_floor) {
          const floor = tierOrder.indexOf(input.tier_floor);
          const current = tierOrder.indexOf(r.retention.tier);
          if (current > floor) return false;
        }
        // Text match
        return r.content.text.toLowerCase().includes(queryLower);
      })
      .slice(0, input.max_results ?? 10);

    return {
      records,
      retrieval_tier_used: 'FULLTEXT',
      tokens_used: 0,
      cache_hit: false,
      query_ms: Date.now() - startMs,
    };
  }

  /** Read a specific record by ID from this domain's JSONL */
  async getById(recordId: string): Promise<AMFRecord | null> {
    const filePath = domainToFilePath(this.domain);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const record = JSON.parse(line) as AMFRecord;
        if (record.record_id === recordId) return record;
      } catch { /* skip malformed */ }
    }
    return null;
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

export function createAMFClient(config: AMFClientConfig): AMFClient {
  return new AMFClient(config);
}
