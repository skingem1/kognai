/**
 * pixabay-client.ts
 * Search Pixabay Videos API and return VideoSourceItem[].
 *
 * Requires: PIXABAY_API_KEY in environment.
 * Free tier: 100 req/min — https://pixabay.com/api/docs/
 */

import type { VideoSourceItem } from './video-source-types.js';

const BASE_URL = 'https://pixabay.com/api/videos/';

interface PixabayVideoVariant {
  url: string;
  width: number;
  height: number;
  size: number;    // bytes
}

interface PixabayHit {
  id: number;
  pageURL: string;
  duration: number;
  views: number;
  downloads: number;
  likes: number;
  videos: {
    large:  PixabayVideoVariant;
    medium: PixabayVideoVariant;
    small:  PixabayVideoVariant;
    tiny:   PixabayVideoVariant;
  };
}

interface PixabayResponse {
  totalHits: number;
  hits: PixabayHit[];
}

/**
 * Pick the best variant with a valid URL: large (≤1920w) → medium → small.
 * Throws if none has a valid URL (item will be filtered out by the caller).
 */
function pickBestVariant(hit: PixabayHit): PixabayVideoVariant {
  const { large, medium, small } = hit.videos;
  if (large.url  && large.width  <= 1920) return large;
  if (medium.url && medium.width > 0)     return medium;
  if (small.url  && small.width  > 0)     return small;
  throw new Error(`No valid video URL for Pixabay hit ${hit.id}`);
}

/** Derive 0-100 score from Pixabay engagement signals. */
function deriveScore(hit: PixabayHit): number {
  const raw = hit.downloads * 0.5 + hit.views * 0.3 + hit.likes * 0.2;
  // Normalise to 0-100: treat 10 000 raw as ~80
  return Math.min(100, Math.round((raw / 10_000) * 80) + 20);
}

/**
 * Search Pixabay for videos matching the given query.
 * @param query       Pixabay search string (e.g. "ocean underwater coral reef")
 * @param topicId     VIRAL_TOPICS id (e.g. "T05") — stored in the brief
 * @param perPage     Results to fetch (max 200 per Pixabay API)
 */
export async function searchPixabay(
  query: string,
  topicId: string,
  perPage = 15,
): Promise<VideoSourceItem[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY not set in environment');

  const url =
    `${BASE_URL}?key=${key}` +
    `&q=${encodeURIComponent(query)}` +
    `&per_page=${perPage}` +
    `&video_type=film` +   // exclude animations
    `&order=popular`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Pixabay API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as PixabayResponse;

  return data.hits
    .map((hit): VideoSourceItem | null => {
      let variant: PixabayVideoVariant;
      try { variant = pickBestVariant(hit); } catch { return null; }
      return {
        source: 'pixabay',
        video_id: String(hit.id),
        title: `Pixabay #${hit.id} — ${query}`,
        download_url: variant.url,
        width: variant.width,
        height: variant.height,
        duration: hit.duration,
        topic_id: topicId,
        source_url: hit.pageURL,
      score: deriveScore(hit),
    };
    })
    .filter((v): v is VideoSourceItem => v !== null);
}
