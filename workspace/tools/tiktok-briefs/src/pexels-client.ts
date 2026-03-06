/**
 * pexels-client.ts
 * Search Pexels Videos API and return VideoSourceItem[].
 * V2: Claude Vision pre-selection scoring replaces the duration/resolution proxy.
 *
 * Requires: PEXELS_API_KEY in environment.
 * Free tier: 200 req/hr, 20 000 req/month — https://www.pexels.com/api/
 */

import type { VideoSourceItem } from './video-source-types.js';
import { scoreFromThumbnail } from './viral-scorer.js';

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
  image: string;     // thumbnail URL — used for Vision scoring
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
  return [...eligible].sort((a, b) => {
    const qScore = (q: string) => (q === 'hd' ? 2 : 1);
    return (qScore(b.quality) * 10_000 + b.width) - (qScore(a.quality) * 10_000 + a.width);
  })[0];
}

/**
 * Search Pexels for videos matching the given query.
 * All results are scored in parallel via Claude Vision before returning.
 * Clips with clip_worthy=false are filtered out.
 *
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
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels API error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as PexelsResponse;

  // Build candidate list (file selection only — no score yet)
  const candidates = data.videos
    .map((v): { video: PexelsVideo; file: PexelsVideoFile } | null => {
      const best = pickBestFile(v.video_files);
      return best ? { video: v, file: best } : null;
    })
    .filter((c): c is { video: PexelsVideo; file: PexelsVideoFile } => c !== null);

  // Score all thumbnails in parallel via Claude Vision
  const scoreResults = await Promise.allSettled(
    candidates.map(({ video }) =>
      scoreFromThumbnail(
        video.image,
        `Pexels query="${query}" duration=${video.duration}s res=${video.width}x${video.height}`,
      ),
    ),
  );

  // Zip candidates + scores — filter out non-worthy clips
  const items: VideoSourceItem[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const { video, file } = candidates[i];
    const result = scoreResults[i];
    const vs = result.status === 'fulfilled' ? result.value : undefined;

    if (vs && !vs.clip_worthy) continue;   // Vision rejected — skip

    items.push({
      source: 'pexels',
      video_id: String(video.id),
      title: `Pexels #${video.id} — ${query}`,
      description: vs ? `${vs.emotional_trigger} | ${vs.reasoning}` : undefined,
      download_url: file.link,
      width: file.width,
      height: file.height,
      duration: video.duration,
      topic_id: topicId,
      source_url: video.url,
      score: vs?.composite_score ?? 50,
    });
  }

  return items;
}
