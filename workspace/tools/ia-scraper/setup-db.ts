/**
 * setup-db.ts
 * Creates the ia_content table in Supabase via the Management API.
 * Run once: tsx setup-db.ts
 *
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in environment (or .env).
 * Uses the postgres REST meta endpoint to verify, then outputs SQL if needed.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;

if (!url || !key) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const db = createClient(url, key);

// Test connection by querying ia_content
const { error } = await db.from('ia_content').select('id').limit(1);

if (!error) {
  console.log('✅ ia_content table already exists — ready to run scraper');
  process.exit(0);
}

if (error.code === 'PGRST205') {
  console.log('⚠️  ia_content table not found. Run this SQL in your Supabase dashboard:');
  console.log(`    https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new\n`);
  console.log(`-- Paste and run this in the SQL editor:`);
  console.log(`----------------------------------------------`);
  console.log(`CREATE TABLE IF NOT EXISTS ia_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  mediatype TEXT NOT NULL,
  subject JSONB,
  creator TEXT,
  source_url TEXT NOT NULL,
  downloads INT,
  views INT,
  score FLOAT NOT NULL,
  score_breakdown JSONB NOT NULL,
  topic_id TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sprint_id TEXT NOT NULL,
  used_in_tiktok BOOLEAN NOT NULL DEFAULT FALSE,
  publicdate TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ia_content_score_idx ON ia_content (score DESC);
CREATE INDEX IF NOT EXISTS ia_content_topic_idx ON ia_content (topic_id);
CREATE INDEX IF NOT EXISTS ia_content_unused_idx ON ia_content (used_in_tiktok, score DESC);`);
  console.log(`----------------------------------------------`);
  console.log(`\nThen run: npm run run`);
} else {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
}
