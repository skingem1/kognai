/**
 * pexels-client.ts
 * Search Pexels Videos API and return VideoSourceItem[].
 *
 * Requires: PEXELS_API_KEY in environment.
 * Free tier: 200 req/hr, 20 000 req/month — https://www.pexels.com/api/
 */

import type { VideoSourceItem } from './video-source-types.js';

const BASE_URL = 'https://api.pexels.com/videos/search';

interface PexelsVideoFile {
  id: number;
  quality: string;   // 'hd' | 'sd' | '4k' | 'uhd' | 'hlsopt'
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  url: string;
  duration: number;
  width: number;
  height: number;
  video_files: PexelsVideoFile[];
}

interface PexelsResponse {
  videos: PexelsVideo[];
  total_results: number;
}

/**
 * Pick the best download file.
 * Prefer HD quality ≤ 1920px — large enough for 9:16 composite, fast to download.
 * Skip 4K/UHD (too heavy). Fall back to best SD if no HD eligible file exists.
 */
function pickBestFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const eligible = files.filter(f => f.link && f.width > 0 && f.width <= 1920);
  if (!eligible.length) return undefined;
  // hd first, then highest width among eligible
  return [...eligible].sort((a, b) => {
    const qScore = (q: string) => (q === 'hd' ? 2 : 1);
    return (qScore(b.quality) * 10_000 + b.width) - (qScore(a.quality) * 10_000 + a.width);
  })[0];
}

/** Derive a 0-100 score from Pexels metadata (Pexels doesn't expose views). */
function deriveScore(video: PexelsVideo): number {
  // Proxy: longer duration + higher resolution = more production value
  const durationScore = Math.min(video.duration / 60, 1) * 40;
  const resScore = video.width >= 1920 ? 40 : video.width >= 1280 ? 25 : 10;
  return Math.round(durationScore + resScore + 20); // base 20
}

/**
 * Search Pexels for videos matching the given query.
 * @param query       Pexels search string (e.g. "wildlife predator prey")
 * @param topicId     VIRAL_TOPICS id (e.g. "T01") — stored in the brief
 * @param perPage     Results to fetch (max 80 per Pexels API)
 */
export async function searchPexels(
  query: string,
  topicId: string,
  perPage = 15,
): Promise<VideoSourceItem[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY not set in environment');

  const url = `${BASE_URL}?query=${encodeURIComponent(query)}&per_page=${perPage}&size=large`;
  const res = await fetch(url, {
    headers: { Authorization: key },
  });

  if (!res.ok) {
    throw new Error(`Pexels API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as PexelsResponse;

  return data.videos
    .map((v): VideoSourceItem | null => {
      const best = pickBestFile(v.video_files);
      if (!best) return null;
      return {
        source: 'pexels',
        video_id: String(v.id),
        title: `Pexels #${v.id} — ${query}`,
        download_url: best.link,
        width: best.width,
        height: best.height,
        duration: v.duration,
        topic_id: topicId,
        source_url: v.url,
        score: deriveScore(v),
      };
    })
    .filter((v): v is VideoSourceItem => v !== null);
}
