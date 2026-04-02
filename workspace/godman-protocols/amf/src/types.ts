/**
 * AMF — Agent Memory Format
 * Six-vector structured memory extraction types
 * @version 0.3.0
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Agent identity string (DID or opaque ID) */
export type AgentId = string;

/** ISO 8601 timestamp */
export type Timestamp = string;

/** Unique session identifier */
export type SessionId = string;

// ---------------------------------------------------------------------------
// Six Memory Vectors
// ---------------------------------------------------------------------------

/**
 * The six extraction vectors that structure all agent memory.
 *
 * Every session transcript is decomposed into exactly these six categories.
 * This replaces unstructured prose memory with a machine-readable format
 * that preserves temporal sequencing, corrections, and event ordering.
 */
export enum MemoryVector {
  /** Agent identity, role, constitutional status */
  PERSONAL_INFO = 'PERSONAL_INFO',
  /** Behavioural patterns, communication style, routing preferences */
  PREFERENCES = 'PREFERENCES',
  /** Sprint outcomes, deployment events, constitutional milestones */
  EVENTS = 'EVENTS',
  /** When things happened, sequence, duration */
  TEMPORAL = 'TEMPORAL',
  /** Corrections: when a new fact supersedes an old one (THE critical vector) */
  UPDATES = 'UPDATES',
  /** Agent-specific knowledge, skill inventory, ACP score history */
  ASSISTANT_INFO = 'ASSISTANT_INFO',
}

// ---------------------------------------------------------------------------
// Vector Entries
// ---------------------------------------------------------------------------

/** A single extracted memory entry within one vector */
export interface VectorEntry {
  /** The extracted content (fact, preference, event description, etc.) */
  content: string;
  /** Extraction confidence: 0.0 to 1.0 */
  confidence: number;
  /** The session that produced this extraction */
  source_session: SessionId;
  /** When this entry was extracted */
  extracted_at: Timestamp;
  /** Whether this entry has been superseded by a newer fact */
  superseded: boolean;
}

/**
 * Six-vector extraction result from a single session.
 *
 * Three parallel observer agents each produce entries across all six vectors.
 * The extraction is then merged and deduplicated into this structure.
 */
export interface SixVectorExtraction {
  [MemoryVector.PERSONAL_INFO]: VectorEntry[];
  [MemoryVector.PREFERENCES]: VectorEntry[];
  [MemoryVector.EVENTS]: VectorEntry[];
  [MemoryVector.TEMPORAL]: VectorEntry[];
  [MemoryVector.UPDATES]: VectorEntry[];
  [MemoryVector.ASSISTANT_INFO]: VectorEntry[];
}

// ---------------------------------------------------------------------------
// Temporal Supersession
// ---------------------------------------------------------------------------

/**
 * Temporal supersession record.
 *
 * When a new fact contradicts an old one, the old fact is marked superseded
 * and excluded from retrieval. This is the critical mechanism that prevents
 * agents from acting on stale information.
 *
 * Constitutionally mandatory: agents MUST record supersessions, not silently
 * overwrite old facts.
 */
export interface TemporalSupersession {
  /** The fact being replaced */
  old_fact: string;
  /** The fact that replaces it */
  new_fact: string;
  /** When the supersession was detected */
  superseded_at: Timestamp;
  /** Why this supersession occurred (e.g. "user corrected address") */
  reason: string;
  /** Session that triggered the supersession */
  source_session: SessionId;
  /** Vector the old fact belonged to */
  vector: MemoryVector;
}

// ---------------------------------------------------------------------------
// Observer + Search Agent Configs
// ---------------------------------------------------------------------------

/**
 * Configuration for a single observer agent.
 *
 * AMF uses three parallel observer agents during ingestion.
 * Each independently extracts facts from a session transcript.
 * Results are merged by the store's ingest method.
 */
export interface ObserverConfig {
  /** Observer agent identity */
  agent_id: AgentId;
  /** Model used for extraction (e.g. "qwen3:4b", "claude-sonnet") */
  model: string;
  /** Extraction focus — which vectors this observer prioritises */
  primary_vectors: MemoryVector[];
  /** Maximum entries per vector per session */
  max_entries_per_vector: number;
  /** Minimum confidence threshold to keep an entry */
  confidence_threshold: number;
}

/**
 * Configuration for a single search agent.
 *
 * AMF uses three parallel search agents during retrieval:
 * 1. direct_facts — exact match lookup across vectors
 * 2. context_implications — inferred knowledge from related entries
 * 3. temporal_timelines — reconstructing event sequences
 *
 * Pure agentic reasoning, no vector DB.
 */
export interface SearchAgentConfig {
  /** Search agent identity */
  agent_id: AgentId;
  /** Model used for search reasoning */
  model: string;
  /** Search strategy */
  strategy: 'direct_facts' | 'context_implications' | 'temporal_timelines';
  /** Maximum results to return */
  max_results: number;
  /** Whether to include superseded entries (default: false) */
  include_superseded: boolean;
}

// ---------------------------------------------------------------------------
// AMF Record
// ---------------------------------------------------------------------------

/**
 * A complete AMF memory record from a single session.
 *
 * This is the unit of storage. Each session produces one AMFRecord
 * containing the six-vector extraction plus metadata.
 */
export interface AMFRecord {
  /** Unique session identifier */
  session_id: SessionId;
  /** When the session occurred */
  timestamp: Timestamp;
  /** The six-vector extraction from this session */
  vectors: SixVectorExtraction;
  /** Agent that owns this memory */
  agent_id: AgentId;
  /** Supersessions detected during this session */
  supersessions: TemporalSupersession[];
  /** Additional metadata */
  metadata: AMFRecordMetadata;
}

/** Metadata attached to an AMFRecord */
export interface AMFRecordMetadata {
  /** Number of entries extracted across all vectors */
  total_entries: number;
  /** Number of supersessions detected */
  supersession_count: number;
  /** Observer agents that produced this extraction */
  observers: AgentId[];
  /** Duration of the source session in seconds */
  session_duration_seconds?: number;
  /** Whether this record has been compacted */
  compacted: boolean;
}

// ---------------------------------------------------------------------------
// AMF Store Interface
// ---------------------------------------------------------------------------

/** Query for retrieving memories */
export interface RetrieveQuery {
  /** Free-text query describing what to find */
  query: string;
  /** Filter to specific vectors (default: all) */
  vectors?: MemoryVector[];
  /** Filter to specific agent */
  agent_id?: AgentId;
  /** Filter to sessions after this timestamp */
  after?: Timestamp;
  /** Filter to sessions before this timestamp */
  before?: Timestamp;
  /** Whether to include superseded entries (default: false) */
  include_superseded?: boolean;
  /** Maximum results */
  limit?: number;
}

/** Result from a memory retrieval */
export interface RetrieveResult {
  /** Matching entries with their source context */
  entries: Array<{
    entry: VectorEntry;
    vector: MemoryVector;
    session_id: SessionId;
    relevance_score: number;
  }>;
  /** Search agents that contributed to this result */
  search_agents: AgentId[];
  /** Total entries scanned */
  total_scanned: number;
}

/** Result from a compaction operation */
export interface CompactResult {
  /** Entries before compaction */
  entries_before: number;
  /** Entries after compaction */
  entries_after: number;
  /** Entries removed (superseded, duplicated, low-confidence) */
  entries_removed: number;
  /** Supersessions applied during compaction */
  supersessions_applied: number;
}

/**
 * AMF Store interface.
 *
 * Defines the contract for any AMF-compliant memory backend.
 * Implementations can use files, SQLite, or any storage — the format
 * and retrieval interface is what AMF standardises.
 */
export interface AMFStore {
  /**
   * Ingest a session transcript into structured memory.
   *
   * Runs three parallel observer agents to extract facts,
   * merges their outputs, detects supersessions, and stores
   * the resulting AMFRecord.
   */
  ingest(session_id: SessionId, transcript: string, agent_id: AgentId): Promise<AMFRecord>;

  /**
   * Retrieve memories matching a query.
   *
   * Runs three parallel search agents (direct_facts, context_implications,
   * temporal_timelines) and merges their results.
   */
  retrieve(query: RetrieveQuery): Promise<RetrieveResult>;

  /**
   * Record a temporal supersession.
   *
   * Marks the old fact as superseded across all records and stores
   * the supersession record for audit trail.
   */
  supersede(supersession: TemporalSupersession): Promise<void>;

  /**
   * Compact stored memory by removing superseded entries,
   * deduplicating, and pruning low-confidence extractions.
   */
  compact(agent_id: AgentId): Promise<CompactResult>;
}
