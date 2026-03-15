// BrainX memory client — AMD-02 Addendum (P0-MEM2)
// Wraps PostgreSQL + pgvector for episodic memory store/retrieve.
// Requires: npm install pg @types/pg
// Requires: PostgreSQL + pgvector running locally (see brainx-schema.sql)

import { embed, cosineSimilarity } from './brainx-embed';

// ── Types ───────────────────────────────────────────────────────────────────

export type MemoryType =
  | 'fact' | 'procedure' | 'episode' | 'preference'
  | 'error' | 'success' | 'reflection'
  | 'skill_rental_gotcha' | 'skill_rental_learning';

export type MemoryTier = 'HOT' | 'WARM' | 'COLD' | 'ARCHIVE' | 'RENTAL_EXPIRED';

export interface BrainXMemory {
  id:                 string;
  agent_id:           string;
  sprint?:            string;
  content:            string;
  summary?:           string;
  embedding:          number[];
  memory_type:        MemoryType;
  tier:               MemoryTier;
  importance:         number;        // 1-10
  tags:               string[];
  access_count:       number;
  last_accessed_at?:  Date;
  created_at:         Date;
  // AMD-02-I rental fields
  rental_id?:         string;
  skill_id?:          string;
  rental_swarm_id?:   string;
  rental_expires_at?: Date;
  propagated_from?:   string;
  is_rental_expired:  boolean;
  feedback_included:  boolean;
  anonymised_content?: string;
}

export interface StoreOptions {
  sprint?:           string;
  memory_type?:      MemoryType;
  importance?:       number;
  tags?:             string[];
  // Rental governance (AMD-02-G)
  rental_id?:        string;
  skill_id?:         string;
  rental_swarm_id?:  string;
  rental_expires_at?: Date;
}

export interface RetrieveOptions {
  topK?:         number;     // default 5
  minImportance?: number;    // default 1
  tiers?:        MemoryTier[];
  sprint?:       string;
  excludeExpired?: boolean;  // default true
}

// ── Client ───────────────────────────────────────────────────────────────────

export class BrainXClient {
  private agentId: string;
  private pg: import('pg').Pool | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  /**
   * Lazily initialise pg pool. Requires pg to be installed.
   * Falls back gracefully if DATABASE_URL / PG* env vars are missing.
   */
  private async getPool(): Promise<import('pg').Pool | null> {
    if (this.pg) return this.pg;
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
      process.stderr.write('[brainx] No DB config — memory ops are no-ops\n');
      return null;
    }
    try {
      const { Pool } = await import('pg');
      this.pg = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30000,
      });
      return this.pg;
    } catch {
      process.stderr.write('[brainx] pg not installed — run: npm install pg\n');
      return null;
    }
  }

  /**
   * Store a memory. Generates embedding automatically.
   * Returns the new memory ID, or null if DB unavailable.
   */
  async store(content: string, opts: StoreOptions = {}): Promise<string | null> {
    const pool = await this.getPool();
    if (!pool) return null;

    const vec = await embed(content);
    const sql = `
      INSERT INTO brainx_memories
        (agent_id, sprint, content, embedding, memory_type, importance, tags,
         rental_id, skill_id, rental_swarm_id, rental_expires_at)
      VALUES ($1,$2,$3,$4::vector,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `;
    const vals = [
      this.agentId,
      opts.sprint   ?? null,
      content,
      `[${vec.join(',')}]`,
      opts.memory_type  ?? 'episode',
      opts.importance   ?? 5,
      opts.tags         ?? [],
      opts.rental_id    ?? null,
      opts.skill_id     ?? null,
      opts.rental_swarm_id    ?? null,
      opts.rental_expires_at  ?? null,
    ];
    const res = await pool.query(sql, vals);
    return (res.rows[0] as { id: string }).id;
  }

  /**
   * Retrieve memories by semantic similarity to a query.
   * Uses pgvector cosine distance for native GPU-accelerated search.
   */
  async retrieve(query: string, opts: RetrieveOptions = {}): Promise<BrainXMemory[]> {
    const pool = await this.getPool();
    if (!pool) return [];

    const topK   = opts.topK         ?? 5;
    const minImp = opts.minImportance ?? 1;
    const tiers  = opts.tiers        ?? ['HOT', 'WARM', 'COLD'];
    const excludeExpired = opts.excludeExpired ?? true;

    const vec = await embed(query);
    const sql = `
      SELECT *, 1 - (embedding <=> $1::vector) AS similarity
      FROM brainx_memories
      WHERE agent_id      = $2
        AND importance   >= $3
        AND tier          = ANY($4::memory_tier_enum[])
        AND ($5::boolean = FALSE OR is_rental_expired = FALSE)
        AND ($6::text IS NULL OR sprint = $6)
      ORDER BY embedding <=> $1::vector
      LIMIT $7
    `;
    const vals = [
      `[${vec.join(',')}]`,
      this.agentId,
      minImp,
      tiers,
      excludeExpired,
      opts.sprint ?? null,
      topK,
    ];
    const res = await pool.query(sql, vals);
    return res.rows as BrainXMemory[];
  }

  /**
   * Promote a memory's access_count and last_accessed_at on retrieval.
   */
  async touch(id: string): Promise<void> {
    const pool = await this.getPool();
    if (!pool) return;
    await pool.query(
      `UPDATE brainx_memories
       SET access_count = access_count + 1, last_accessed_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Inject HOT-tier memories as context prefix for the agent's next prompt.
   * Returns formatted text block, empty string if no HOT memories.
   */
  async injectContext(sprintHint?: string): Promise<string> {
    const pool = await this.getPool();
    if (!pool) return '';
    const sql = `
      SELECT content FROM brainx_memories
      WHERE agent_id = $1 AND tier = 'HOT'
        AND ($2::text IS NULL OR sprint = $2)
      ORDER BY importance DESC, created_at DESC
      LIMIT 10
    `;
    const res = await pool.query(sql, [this.agentId, sprintHint ?? null]);
    if (res.rows.length === 0) return '';
    const lines = (res.rows as { content: string }[]).map(r => `- ${r.content}`).join('\n');
    return `## Episodic Memory (HOT)\n${lines}\n`;
  }

  async close(): Promise<void> {
    if (this.pg) { await this.pg.end(); this.pg = null; }
  }
}

// ── Smoke test ───────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const client = new BrainXClient('smoke-test-agent');
    console.log('\n🧠 BrainX Client Smoke Test');
    const id = await client.store('Agents must seek knowledge before acting.', {
      memory_type: 'reflection', importance: 8, tags: ['five-principles'],
    });
    if (id) {
      console.log(`✅ store() → id: ${id}`);
      const results = await client.retrieve('what should agents do before starting?');
      console.log(`✅ retrieve() → ${results.length} results`);
    } else {
      console.log('⚠️  DB not configured — graceful no-op confirmed');
    }
    await client.close();
  })();
}
