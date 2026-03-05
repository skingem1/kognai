/**
 * storage.ts
 * Persists scored IA items to Supabase ia_content table.
 * Requires SUPABASE_URL and SUPABASE_ANON_KEY in environment.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ScoredItem } from './content-scorer.js';

export interface StoredItem extends ScoredItem {
  id?: string;
  scraped_at: string;
  sprint_id: string;
  used_in_tiktok: boolean;
}

// Supabase table DDL (run once via migration):
//
// CREATE TABLE IF NOT EXISTS ia_content (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   identifier TEXT UNIQUE NOT NULL,
//   title TEXT NOT NULL,
//   description TEXT,
//   mediatype TEXT NOT NULL,
//   subject JSONB,
//   creator TEXT,
//   source_url TEXT NOT NULL,
//   downloads INT,
//   views INT,
//   score FLOAT NOT NULL,
//   score_breakdown JSONB NOT NULL,
//   topic_id TEXT,
//   scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
//   sprint_id TEXT NOT NULL,
//   used_in_tiktok BOOLEAN NOT NULL DEFAULT FALSE,
//   publicdate TIMESTAMPTZ
// );

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment');
  _client = createClient(url, key);
  return _client;
}

/** Upsert scored items. Returns count of inserted vs skipped (conflict). */
export async function upsertItems(
  items: ScoredItem[],
  sprintId: string,
): Promise<{ inserted: number; skipped: number }> {
  if (items.length === 0) return { inserted: 0, skipped: 0 };
  const db = getClient();
  const rows = items.map(item => ({
    identifier: item.identifier,
    title: item.title,
    description: item.description ?? null,
    mediatype: item.mediatype,
    subject: item.subject ?? null,
    creator: item.creator ?? null,
    source_url: item.source_url,
    downloads: item.downloads ?? null,
    views: item.views ?? null,
    score: item.score,
    score_breakdown: item.score_breakdown,
    topic_id: item.topic_id ?? null,
    scraped_at: new Date().toISOString(),
    sprint_id: sprintId,
    used_in_tiktok: false,
    publicdate: item.publicdate ?? null,
  }));

  const { data, error } = await db
    .from('ia_content')
    .upsert(rows, { onConflict: 'identifier', ignoreDuplicates: false })
    .select('identifier');

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  const inserted = data?.length ?? 0;
  return { inserted, skipped: items.length - inserted };
}

/** Get top unused items sorted by score desc. */
export async function getTopUnused(limit = 20): Promise<StoredItem[]> {
  const db = getClient();
  const { data, error } = await db
    .from('ia_content')
    .select('*')
    .eq('used_in_tiktok', false)
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data ?? []) as StoredItem[];
}

/** Mark an item as used in a TikTok post. */
export async function markUsed(identifier: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from('ia_content')
    .update({ used_in_tiktok: true })
    .eq('identifier', identifier);
  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}
