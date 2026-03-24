/**
 * AMD-25 — Domain Knowledge Architecture (DKA) Schema
 * Sprint 959 — Design only, no implementation
 *
 * Defines the typed schema for Kognai's 5 domain knowledge stores
 * with AMF-extended vector format for semantic retrieval.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** ISO 8601 timestamp */
export type Timestamp = string;

/** Agent identifier */
export type AgentId = string;

/** Domain identifiers — the 5 canonical knowledge domains */
export type DomainId = 'trading' | 'bizdev' | 'research' | 'content' | 'regulatory';

/** Security classification for knowledge entries */
export type Classification = 'public' | 'internal' | 'restricted' | 'confidential';

// ---------------------------------------------------------------------------
// AMF-Extended Vector Format
// ---------------------------------------------------------------------------

/**
 * A vector embedding with AMF metadata.
 * Extends the standard AMF Envelope pattern with vector-specific fields.
 */
export interface DKAVector {
  /** Unique vector ID */
  id: string;
  /** Domain this vector belongs to */
  domain: DomainId;
  /** The embedding vector (float32 array) */
  embedding: number[];
  /** Embedding model used (e.g. 'text-embedding-3-small', 'local/nomic-embed') */
  model: string;
  /** Embedding dimensions (e.g. 1536, 768) */
  dimensions: number;
  /** The source text that was embedded */
  sourceText: string;
  /** Source document reference (file path, URL, or document ID) */
  sourceRef: string;
  /** Agent that created this vector */
  createdBy: AgentId;
  /** Security classification */
  classification: Classification;
  /** AMF metadata tags for retrieval filtering */
  tags: string[];
  /** ISO 8601 — when this vector was created */
  createdAt: Timestamp;
  /** ISO 8601 — when the source was last verified as current */
  verifiedAt: Timestamp;
  /** Confidence score (0.0 to 1.0) — how reliable is this knowledge */
  confidence: number;
  /** Expiry hint — after this date, the Curator should re-verify */
  expiresAt?: Timestamp;
}

// ---------------------------------------------------------------------------
// Domain Knowledge Store
// ---------------------------------------------------------------------------

/**
 * Configuration for a single domain knowledge store.
 */
export interface DomainStore {
  /** Domain identifier */
  id: DomainId;
  /** Human-readable name */
  name: string;
  /** Description of what knowledge this domain covers */
  description: string;
  /** Allowed agents that can READ from this store */
  readAccess: AgentId[] | '*';
  /** Allowed agents that can WRITE to this store */
  writeAccess: AgentId[];
  /** Maximum vectors in this store (capacity limit) */
  maxVectors: number;
  /** Default embedding model for this domain */
  defaultModel: string;
  /** Default classification for new entries */
  defaultClassification: Classification;
  /** Retention policy in days (0 = indefinite) */
  retentionDays: number;
  /** Whether constitutional retrieval filters are enforced */
  constitutionalFilterEnabled: boolean;
}

/**
 * The 5 canonical domain store configurations.
 */
export const DOMAIN_STORES: Record<DomainId, DomainStore> = {
  trading: {
    id: 'trading',
    name: 'Trading Intelligence',
    description: 'Market data, price signals, trade execution patterns, portfolio analysis, x402 transaction history',
    readAccess: ['satoshi', 'ceo', 'cfo', 'intelligence'],
    writeAccess: ['satoshi', 'intelligence'],
    maxVectors: 50000,
    defaultModel: 'text-embedding-3-small',
    defaultClassification: 'restricted',
    retentionDays: 365,
    constitutionalFilterEnabled: true,
  },
  bizdev: {
    id: 'bizdev',
    name: 'Business Development',
    description: 'Partnership leads, deal pipeline, investor relations, market positioning, competitive intelligence',
    readAccess: ['ceo', 'cmo', 'bizdev', 'intelligence'],
    writeAccess: ['bizdev', 'intelligence'],
    maxVectors: 30000,
    defaultModel: 'text-embedding-3-small',
    defaultClassification: 'internal',
    retentionDays: 180,
    constitutionalFilterEnabled: true,
  },
  research: {
    id: 'research',
    name: 'Research & Academic',
    description: 'Papers, technical reports, architecture decisions, protocol specs, DRI research outputs',
    readAccess: '*',
    writeAccess: ['intelligence', 'cto', 'coder'],
    maxVectors: 100000,
    defaultModel: 'local/nomic-embed',
    defaultClassification: 'public',
    retentionDays: 0,
    constitutionalFilterEnabled: false,
  },
  content: {
    id: 'content',
    name: 'Content & Media',
    description: 'TikTok topics, script patterns, viral trends, audience analytics, SCS-001 pipeline knowledge',
    readAccess: ['scs001-*', 'cmo', 'ceo'],
    writeAccess: ['scs001-discovery', 'scs001-trend', 'scs001-analytics'],
    maxVectors: 50000,
    defaultModel: 'text-embedding-3-small',
    defaultClassification: 'internal',
    retentionDays: 90,
    constitutionalFilterEnabled: false,
  },
  regulatory: {
    id: 'regulatory',
    name: 'Regulatory & Compliance',
    description: 'Legal requirements, platform ToS, data protection rules, Tunisian regulations (for Achiri), financial compliance',
    readAccess: ['ceo', 'cfo', 'security', 'supervisor'],
    writeAccess: ['security', 'ceo'],
    maxVectors: 10000,
    defaultModel: 'text-embedding-3-small',
    defaultClassification: 'confidential',
    retentionDays: 0,
    constitutionalFilterEnabled: true,
  },
};

// ---------------------------------------------------------------------------
// Retrieval types
// ---------------------------------------------------------------------------

/**
 * A query against the DKA.
 */
export interface DKAQuery {
  /** Natural language query text */
  queryText: string;
  /** Which domains to search (empty = all accessible) */
  domains: DomainId[];
  /** Agent making the query (for access control) */
  agent: AgentId;
  /** Maximum results to return */
  topK: number;
  /** Minimum similarity threshold (0.0 to 1.0) */
  minSimilarity: number;
  /** Tag filters (results must have ALL of these tags) */
  requiredTags?: string[];
  /** Maximum age of results in days (0 = no limit) */
  maxAgeDays?: number;
}

/**
 * A single retrieval result.
 */
export interface DKAResult {
  /** The matched vector */
  vector: DKAVector;
  /** Cosine similarity score */
  similarity: number;
  /** Whether this result passed constitutional filters */
  constitutionallyApproved: boolean;
}
