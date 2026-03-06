-- tiktok-briefs-v2-migration.sql
-- Sprint-057: Multi-source video support (Pexels, Pixabay, + future sources)
-- Run once in Supabase SQL editor:
-- https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new

-- 1. Sprint-056 compose fields (idempotent — skip if already added)
ALTER TABLE tiktok_briefs
  ADD COLUMN IF NOT EXISTS clip_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS final_path   TEXT;

-- 2. Make ia_identifier nullable (was NOT NULL — now optional for non-IA sources)
ALTER TABLE tiktok_briefs
  ALTER COLUMN ia_identifier DROP NOT NULL;

-- 3. Multi-source fields
ALTER TABLE tiktok_briefs
  ADD COLUMN IF NOT EXISTS video_source       TEXT NOT NULL DEFAULT 'internet_archive',
  ADD COLUMN IF NOT EXISTS video_id           TEXT,
  ADD COLUMN IF NOT EXISTS video_download_url TEXT;

-- 4. Backfill: existing rows — copy ia_identifier into video_id
UPDATE tiktok_briefs
  SET video_id = ia_identifier
  WHERE video_source = 'internet_archive' AND video_id IS NULL AND ia_identifier IS NOT NULL;

-- 5. Index for source-based filtering
CREATE INDEX IF NOT EXISTS tiktok_briefs_clip_status_idx
  ON tiktok_briefs (clip_status, status);
CREATE INDEX IF NOT EXISTS tiktok_briefs_video_source_idx
  ON tiktok_briefs (video_source, status);
