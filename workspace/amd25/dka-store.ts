/**
 * AMD-25 — Domain Knowledge Architecture: KnowledgeStore
 * Sprint 997 — In-memory keyword store (no embeddings, no external deps)
 * Sprint 1290 — LRU eviction: cap total store at MAX_STORE_SIZE (1000) docs
 *
 * Keyword search replaces vector cosine similarity with token overlap scoring.
 * Compatible with DKAQuery/DKAResult types from dka-schema.ts.
 */

import { createHash } from 'crypto';
import type {
  DKAVector, DKAQuery, DKAResult, DomainId, AgentId, Classification
} from './dka-schema.js';
import { DOMAIN_STORES } from './dka-schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddEntryParams {
  domain: DomainId;
  sourceText: string;
  sourceRef: string;
  createdBy: AgentId;
  classification: Classification;
  tags: string[];
  confidence: number;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// KnowledgeStore
// ---------------------------------------------------------------------------

/** Global LRU cap — evict oldest-accessed entries when exceeded. Sprint 1290. */
const MAX_STORE_SIZE = 1000;

export interface EvictionEvent {
  evictedId: string;
  evictedDomain: DomainId;
  reason: 'lru-cap';
  storeSize: number;
  timestamp: string;
}

export class KnowledgeStore {
  private entries: Map<string, DKAVector> = new Map();
  /** LRU tracking: id → last access timestamp (ms). Updated on add + getById. Sprint 1290. */
  private accessOrder: Map<string, number> = new Map();
  /** Cumulative eviction count for metrics. Sprint 1290. */
  evictionCount = 0;
  /** Optional eviction listener for metrics/logging. Sprint 1290. */
  onEvict?: (event: EvictionEvent) => void;

  /** Add a knowledge entry. Returns the entry id, or throws if domain is full. */
  add(params: AddEntryParams): string {
    const store = DOMAIN_STORES[params.domain];
    const domainCount = this.countByDomain(params.domain);
    if (domainCount >= store.maxVectors) {
      throw new Error(`Domain '${params.domain}' is at capacity (${store.maxVectors})`);
    }
    const now = new Date().toISOString();
    const id = createHash('sha256')
      .update(`${params.domain}:${params.sourceRef}:${params.createdBy}:${now}`)
      .digest('hex')
      .slice(0, 16);
    const vector: DKAVector = {
      id,
      domain: params.domain,
      embedding: [],           // keyword mode: no embedding
      model: 'keyword',
      dimensions: 0,
      sourceText: params.sourceText,
      sourceRef: params.sourceRef,
      createdBy: params.createdBy,
      classification: params.classification,
      tags: params.tags,
      createdAt: now,
      verifiedAt: now,
      confidence: params.confidence,
      expiresAt: params.expiresAt,
    };
    this.entries.set(id, vector);
    this.accessOrder.set(id, Date.now());

    // Sprint 1290: LRU eviction — cap global store at MAX_STORE_SIZE
    if (this.entries.size > MAX_STORE_SIZE) {
      this._evictLRU();
    }

    return id;
  }

  /** Evict the least-recently-used entry. Sprint 1290. */
  private _evictLRU(): void {
    let lruId: string | null = null;
    let lruTime = Infinity;
    for (const [id, t] of this.accessOrder) {
      if (t < lruTime) { lruTime = t; lruId = id; }
    }
    if (!lruId) return;
    const evicted = this.entries.get(lruId);
    this.entries.delete(lruId);
    this.accessOrder.delete(lruId);
    this.evictionCount++;
    if (evicted && this.onEvict) {
      this.onEvict({
        evictedId: lruId,
        evictedDomain: evicted.domain,
        reason: 'lru-cap',
        storeSize: this.entries.size,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /** Retrieve a single entry by id. Updates LRU access time. Sprint 1290. */
  getById(id: string): DKAVector | undefined {
    const entry = this.entries.get(id);
    if (entry) this.accessOrder.set(id, Date.now()); // refresh LRU
    return entry;
  }

  /** Retrieve all entries for a domain. */
  getByDomain(domain: DomainId): DKAVector[] {
    return Array.from(this.entries.values()).filter(e => e.domain === domain);
  }

  /** Keyword search using token overlap scoring. Respects query filters. */
  search(query: DKAQuery): DKAResult[] {
    const tokens = tokenise(query.queryText);
    if (tokens.length === 0) return [];

    const now = Date.now();
    const results: DKAResult[] = [];

    for (const entry of this.entries.values()) {
      // Domain filter
      if (query.domains.length > 0 && !query.domains.includes(entry.domain)) continue;

      // Age filter
      if (query.maxAgeDays && query.maxAgeDays > 0) {
        const ageMs = now - new Date(entry.createdAt).getTime();
        if (ageMs > query.maxAgeDays * 86_400_000) continue;
      }

      // Expiry filter
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) continue;

      // Tag filter (all required tags must be present)
      if (query.requiredTags && query.requiredTags.length > 0) {
        if (!query.requiredTags.every(t => entry.tags.includes(t))) continue;
      }

      // Keyword similarity (token overlap / query length)
      const similarity = keywordSimilarity(tokens, entry);
      if (similarity < query.minSimilarity) continue;

      const store = DOMAIN_STORES[entry.domain];
      results.push({
        vector: entry,
        similarity,
        constitutionallyApproved: !store.constitutionalFilterEnabled || entry.confidence >= 0.7,
      });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, query.topK);
  }

  /** Remove an entry by id. Returns true if removed. */
  remove(id: string): boolean {
    this.accessOrder.delete(id);
    return this.entries.delete(id);
  }

  /** Total entry count. */
  size(): number { return this.entries.size; }

  private countByDomain(domain: DomainId): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.domain === domain) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenise(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function keywordSimilarity(queryTokens: string[], entry: DKAVector): number {
  const haystack = `${entry.sourceText} ${entry.tags.join(' ')}`.toLowerCase();
  const matched = queryTokens.filter(t => haystack.includes(t)).length;
  return matched / queryTokens.length;
}
