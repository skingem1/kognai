-- video-sources-migration.sql
-- Run once in Supabase SQL editor:
-- https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new
--
-- Stores the 50 open video sources from the viral agent reference doc.
-- Used by the content pipeline to discover and fetch source footage.

CREATE TABLE IF NOT EXISTS video_sources (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  url            TEXT NOT NULL,
  category       TEXT NOT NULL,   -- government_archive | stock_footage | creative_commons | scientific | news_documentary | specialized
  license        TEXT NOT NULL,   -- public_domain | cc0 | cc_by | cc_by_sa | pexels | pixabay | coverr | royalty_free | mixed | embed_only
  api_available  BOOLEAN NOT NULL DEFAULT FALSE,
  api_url        TEXT,
  api_docs       TEXT,
  api_key_required BOOLEAN NOT NULL DEFAULT FALSE,
  rate_limits    TEXT,
  content_types  TEXT[] NOT NULL DEFAULT '{}',
  agent_notes    TEXT,
  commercial_use BOOLEAN NOT NULL DEFAULT TRUE,
  attribution_required BOOLEAN NOT NULL DEFAULT FALSE,
  tier           INT NOT NULL DEFAULT 3 CHECK (tier IN (1, 2, 3)),
  best_content_type TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Internal operations table — no user-facing RLS needed
ALTER TABLE video_sources DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS video_sources_tier_idx    ON video_sources (tier, active);
CREATE INDEX IF NOT EXISTS video_sources_category_idx ON video_sources (category);
CREATE INDEX IF NOT EXISTS video_sources_api_idx     ON video_sources (api_available, active);
