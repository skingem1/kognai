/**
 * briefs-storage.ts
 * Supabase storage layer for TikTok content briefs.
 *
 * Run this SQL once in your Supabase dashboard before first use:
 * https://supabase.com/dashboard/project/hroblewzdsosomytdvwe/sql/new
 *
 * CREATE TABLE IF NOT EXISTS tiktok_briefs (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   ia_identifier TEXT NOT NULL,
 *   topic_id TEXT NOT NULL,
 *   topic_name TEXT NOT NULL,
 *   source_url TEXT NOT NULL,
 *   source_title TEXT NOT NULL,
 *   hook TEXT NOT NULL,
 *   caption TEXT NOT NULL,
 *   hashtags TEXT[] NOT NULL,
 *   music_direction TEXT NOT NULL,
 *   duration_seconds INT NOT NULL,
 *   platform TEXT NOT NULL,
 *   viral_trigger TEXT NOT NULL,
 *   score FLOAT NOT NULL,
 *   status TEXT NOT NULL DEFAULT 'draft',
 *   generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   sprint_id TEXT NOT NULL,
 *   posted_at TIMESTAMPTZ,
 *   post_url TEXT
 * );
 * CREATE INDEX IF NOT EXISTS tiktok_briefs_status_idx ON tiktok_briefs (status, score DESC);
 * CREATE INDEX IF NOT EXISTS tiktok_briefs_topic_idx ON tiktok_briefs (topic_id);
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface TikTokBrief {
  id?: string;
  ia_identifier: string;
  topic_id: string;
  topic_name: string;
  source_url: string;
  source_title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  music_direction: string;
  duration_seconds: number;
  platform: 'tiktok' | 'instagram_reels' | 'youtube_shorts';
  viral_trigger: string;
  score: number;
  status: 'draft' | 'approved' | 'posted' | 'rejected';
  generated_at?: string;
  sprint_id: string;
  posted_at?: string;
  post_url?: string;
}

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  _client = createClient(url, key);
  return _client;
}

/** Insert a new brief. Returns the generated UUID. */
export async function insertBrief(brief: TikTokBrief): Promise<string> {
  const db = getClient();
  const { data, error } = await db
    .from('tiktok_briefs')
    .insert({ ...brief, id: undefined })
    .select('id')
    .single();
  if (error) throw new Error(`insertBrief failed: ${error.message}`);
  return data.id as string;
}

/** Get all draft briefs ordered by score desc. */
export async function getDraftBriefs(limit = 50): Promise<TikTokBrief[]> {
  const db = getClient();
  const { data, error } = await db
    .from('tiktok_briefs')
    .select('*')
    .eq('status', 'draft')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getDraftBriefs failed: ${error.message}`);
  return (data ?? []) as TikTokBrief[];
}

/** Approve a brief for production. */
export async function approveBrief(id: string): Promise<void> {
  const db = getClient();
  const { error } = await db.from('tiktok_briefs').update({ status: 'approved' }).eq('id', id);
  if (error) throw new Error(`approveBrief failed: ${error.message}`);
}

/** Mark a brief as posted with its live URL. */
export async function markPosted(id: string, postUrl: string): Promise<void> {
  const db = getClient();
  const { error } = await db
    .from('tiktok_briefs')
    .update({ status: 'posted', post_url: postUrl, posted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`markPosted failed: ${error.message}`);
}
