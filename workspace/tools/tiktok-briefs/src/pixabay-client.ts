/**
 * pixabay-client.ts
 * Search Pixabay Videos API and return VideoSourceItem[].
 * V2: Claude Vision pre-selection scoring blended with Pixabay engagement signals.
 *
 * Requires: PIXABAY_API_KEY in environment.
 * Free tier: 100 req/min — https://pixabay.com/api/docs/
 */

import type { VideoSourceItem } from './video-source-types.js';
import { scoreFromThumbnail } from './viral-scorer.js';

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
  picture_id: string;  // Vimeo CDN ID — used to construct thumbnail URL
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

/** Construct Vimeo CDN thumbnail URL from Pixabay picture_id. */
function thumbnailUrl(hit: PixabayHit): string {
  return `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`;
}

/**
 * Derive 0-100 engagement score from Pixabay signals.
 * Used as a 30% weight alongside Vision composite (70%).
 */
function engagementScore(hit: PixabayHit): number {
  const raw = hit.downloads * 0.5 + hit.views * 0.3 + hit.likes * 0.2;
  // Normalise to 0-100: treat 10 000 raw as ~80
  return Math.min(100, Math.round((raw / 10_000) * 80) + 20);
}

/**
 * Search Pixabay for videos matching the given query.
 * All results are scored in parallel via Claude Vision before returning.
 * Clips with clip_worthy=false are filtered out.
 * Final score = Vision composite (70%) + engagement score (30%).
 *
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
  if (!res.ok) throw new Error(`Pixabay API error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as PixabayResponse;

  // Build candidate list (variant selection only — no score yet)
  const candidates = data.hits
    .map((hit): { hit: PixabayHit; variant: PixabayVideoVariant } | null => {
      try {
        const variant = pickBestVariant(hit);
        return { hit, variant };
      } catch {
        return null;
      }
    })
    .filter((c): c is { hit: PixabayHit; variant: PixabayVideoVariant } => c !== null);

  // Score all thumbnails in parallel via Claude Vision
  const scoreResults = await Promise.allSettled(
    candidates.map(({ hit }) =>
      scoreFromThumbnail(
        thumbnailUrl(hit),
        `Pixabay query="${query}" duration=${hit.duration}s views=${hit.views} downloads=${hit.downloads}`,
      ),
    ),
  );

  // Zip candidates + scores — filter out non-worthy clips — blend scores
  const items: VideoSourceItem[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { hit, variant } = candidates[i];
    const result = scoreResults[i];
    const vs = result.status === 'fulfilled' ? result.value : undefined;

    if (vs && !vs.clip_worthy) continue;   // Vision rejected — skip

    const base = engagementScore(hit);
    const finalScore = vs
      ? Math.round(vs.composite_score * 0.7 + base * 0.3)
      : base;

    items.push({
      source: 'pixabay',
      video_id: String(hit.id),
      title: `Pixabay #${hit.id} — ${query}`,
      description: vs ? `${vs.emotional_trigger} | ${vs.reasoning}` : undefined,
      download_url: variant.url,
      width: variant.width,
      height: variant.height,
      duration: hit.duration,
      topic_id: topicId,
      source_url: hit.pageURL,
      score: finalScore,
    });
  }

  return items;
}
