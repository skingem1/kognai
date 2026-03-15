-- BrainX Episodic Memory Schema — AMD-02 Addendum (P0-MEM2)
-- PostgreSQL + pgvector (768 dims for nomic-embed-text)
--
-- Setup prerequisites:
--   1. brew install postgresql@16
--   2. brew services start postgresql@16
--   3. psql -d postgres -c "CREATE DATABASE kognai;"
--   4. psql -d kognai -c "CREATE EXTENSION IF NOT EXISTS vector;"
--   5. psql -d kognai -f scripts/lib/brainx-schema.sql
--
-- Environment variables required:
--   PGHOST=localhost  PGPORT=5432  PGDATABASE=kognai  PGUSER=<user>  PGPASSWORD=<pass>

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Memory type enum (BrainX defaults + AMD-02 Skill Bank extensions)
DO $$ BEGIN
  CREATE TYPE memory_type_enum AS ENUM (
    'fact',
    'procedure',
    'episode',
    'preference',
    'error',
    'success',
    'reflection',
    'skill_rental_gotcha',    -- AMD-02: discovered while using a rented skill
    'skill_rental_learning'   -- AMD-02: learning gained during a rental period
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Memory tier enum
DO $$ BEGIN
  CREATE TYPE memory_tier_enum AS ENUM (
    'HOT',            -- recent, high importance — auto-injected first
    'WARM',           -- moderate, occasional access
    'COLD',           -- older, rarely accessed — retrievable
    'ARCHIVE',        -- below quality threshold — audit trail only
    'RENTAL_EXPIRED'  -- AMD-02: rental-scoped copy whose rental ended
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Main memories table
CREATE TABLE IF NOT EXISTS brainx_memories (
  -- Identity
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id            TEXT        NOT NULL,
  sprint              TEXT,

  -- Content
  content             TEXT        NOT NULL,
  summary             TEXT,                       -- Qwen3-4B distilled summary
  embedding           VECTOR(768) NOT NULL,       -- nomic-embed-text output (768 dims)

  -- Classification
  memory_type         memory_type_enum NOT NULL DEFAULT 'episode',
  tier                memory_tier_enum NOT NULL DEFAULT 'WARM',
  importance          SMALLINT    NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  tags                TEXT[]      DEFAULT '{}',

  -- Access tracking
  access_count        INTEGER     NOT NULL DEFAULT 0,
  last_accessed_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- AMD-02-I: Rental memory governance fields
  rental_id           UUID,                       -- rental agreement ID
  skill_id            TEXT,                       -- Skill Bank skill ID
  rental_swarm_id     TEXT,                       -- propagation restricted to this swarm
  rental_expires_at   TIMESTAMPTZ,                -- tier → RENTAL_EXPIRED after this
  propagated_from     UUID        REFERENCES brainx_memories(id) ON DELETE SET NULL,
  is_rental_expired   BOOLEAN     NOT NULL DEFAULT FALSE,
  feedback_included   BOOLEAN     NOT NULL DEFAULT FALSE, -- prevents double-counting
  anonymised_content  TEXT                        -- prepared for creator feedback summary
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Vector similarity search (IVFFlat — tune lists after data grows)
CREATE INDEX IF NOT EXISTS brainx_embed_idx
  ON brainx_memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Fast lookups by agent
CREATE INDEX IF NOT EXISTS brainx_agent_idx    ON brainx_memories (agent_id);

-- Tier queries (HOT-first injection)
CREATE INDEX IF NOT EXISTS brainx_tier_idx     ON brainx_memories (tier, importance DESC);

-- Rental expiry cron queries
CREATE INDEX IF NOT EXISTS brainx_rental_idx   ON brainx_memories (rental_expires_at)
  WHERE rental_expires_at IS NOT NULL AND is_rental_expired = FALSE;

-- Sprint-scoped queries
CREATE INDEX IF NOT EXISTS brainx_sprint_idx   ON brainx_memories (sprint);

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS brainx_updated_at ON brainx_memories;
CREATE TRIGGER brainx_updated_at
  BEFORE UPDATE ON brainx_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Rental expiry view ───────────────────────────────────────────────────────
-- Cron job queries this to find expired rentals every hour

CREATE OR REPLACE VIEW brainx_expired_rentals AS
SELECT id, agent_id, rental_id, skill_id, propagated_from, anonymised_content
FROM brainx_memories
WHERE rental_expires_at < NOW()
  AND is_rental_expired = FALSE
  AND memory_type IN ('skill_rental_gotcha', 'skill_rental_learning');

-- ── Creator feedback view ────────────────────────────────────────────────────
-- Aggregated anonymised summaries per skill, ready for delivery to creator

CREATE OR REPLACE VIEW brainx_creator_feedback AS
SELECT
  skill_id,
  memory_type,
  COUNT(*)          AS occurrence_count,
  MAX(importance)   AS max_severity
FROM brainx_memories
WHERE is_rental_expired = TRUE
  AND feedback_included = FALSE
  AND anonymised_content IS NOT NULL
GROUP BY skill_id, memory_type;
