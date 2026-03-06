/**
 * viral-scorer.ts
 * Claude Vision-based viral potential scorer.
 *
 * Sends a video thumbnail to Claude Haiku with a structured scoring prompt.
 * Used as a pre-selection filter in pexels-client and pixabay-client BEFORE
 * any clip is selected or downloaded — replacing weak metadata proxies.
 *
 * Based on: viral_detection_upgrade_report.md — Method 9 (Multimodal LLM Frame Analysis)
 * Adapted to Claude Vision instead of Gemini/GPT-4o for zero-infrastructure integration.
 *
 * Cost: ~$0.001–0.002 per clip (Claude Haiku + one image).
 * Speed: ~1–2s per clip, fully parallelisable.
 * Failure mode: returns FALLBACK_SCORE (neutral, clip_worthy=true) — never blocks the pipeline.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

export interface ViralScore {
  clip_worthy: boolean;
  hook_score: number;                   // 0–10: how compelling is the visual hook?
  emotional_trigger:                    // dominant emotional response
    | 'awe' | 'amusement' | 'shock'
    | 'inspiration' | 'nostalgia' | 'none';
  motion_quality: 'high' | 'medium' | 'low';
  topic_category: string;
  reasoning: string;
  composite_score: number;              // 0–100 final ranking score
}

/** Returned on any failure — never throws, never blocks the pipeline */
const FALLBACK_SCORE: ViralScore = {
  clip_worthy: true,
  hook_score: 5,
  emotional_trigger: 'none',
  motion_quality: 'medium',
  topic_category: 'other',
  reasoning: 'Vision score unavailable — using neutral default',
  composite_score: 50,
};

const SCORING_PROMPT = `You are a viral content analyst for TikTok/Instagram Reels.
Analyze this video thumbnail and score its viral potential for a 15–30 second short-form clip.
Return ONLY valid JSON — no markdown, no explanation.

{
  "clip_worthy": <true if this has genuine viral potential, false if generic/boring/stock-cliché>,
  "hook_score": <0-10, how compelling is the visual as an opening hook?>,
  "emotional_trigger": <"awe"|"amusement"|"shock"|"inspiration"|"nostalgia"|"none">,
  "motion_quality": <"high" if clearly dynamic/action, "medium" if some movement, "low" if fully static>,
  "topic_category": <"wildlife"|"space"|"weather"|"animals"|"history"|"sports"|"science"|"nature"|"beauty"|"other">,
  "reasoning": "<one sentence explaining the score>"
}

Scoring guide:
- clip_worthy=true requires hook_score >= 6 AND emotional_trigger != "none"
- Reject (clip_worthy=false): generic office workers, plain cityscapes, talking heads, stock food shots
- Accept: dramatic nature, visible action, unusual perspective, strong emotion, surprise, awe-inspiring scale
- Reward: subjects that would make someone STOP scrolling in the first 3 seconds`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

/** Fetch a thumbnail URL and return base64 + detected media type */
async function fetchBase64(url: string): Promise<{
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Thumbnail fetch ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  const ct = res.headers.get('content-type') ?? 'image/jpeg';
  const mediaType = ct.includes('png')  ? 'image/png'  as const
                  : ct.includes('webp') ? 'image/webp' as const
                  : 'image/jpeg' as const;
  return { data: Buffer.from(buf).toString('base64'), mediaType };
}

/**
 * Composite score formula — weights from SnapUGC ECCV 2024 feature importance.
 * hook(40%) + emotional_trigger(35%) + motion_quality(25%)
 */
function buildComposite(s: Omit<ViralScore, 'composite_score'>): number {
  const emotionWeight: Record<string, number> = {
    awe: 1.0, shock: 0.9, amusement: 0.85, inspiration: 0.8, nostalgia: 0.6, none: 0.1,
  };
  const motionWeight: Record<string, number> = { high: 1.0, medium: 0.6, low: 0.2 };
  return Math.round(
    (s.hook_score / 10) * 40 +
    (emotionWeight[s.emotional_trigger] ?? 0.1) * 35 +
    (motionWeight[s.motion_quality] ?? 0.2) * 25,
  );
}

/**
 * Score a clip's viral potential from its thumbnail URL.
 *
 * @param thumbnailUrl  Direct URL to the thumbnail image (JPEG/PNG/WebP)
 * @param hint          Short metadata string for context, e.g. "Pexels wildlife 30s 1920x1080"
 * @returns             ViralScore — never throws, falls back to FALLBACK_SCORE on any error
 */
export async function scoreFromThumbnail(
  thumbnailUrl: string,
  hint: string,
): Promise<ViralScore> {
  // Bypass vision in dry-run / test mode to keep things fast
  if (process.env.SKIP_VISION_SCORING === '1') {
    return { ...FALLBACK_SCORE };
  }

  try {
    const { data, mediaType } = await fetchBase64(thumbnailUrl);

    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: `${SCORING_PROMPT}\n\nVideo metadata: ${hint}` },
        ],
      }],
    });

    const raw   = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(clean) as Omit<ViralScore, 'composite_score'>;

    return { ...parsed, composite_score: buildComposite(parsed) };
  } catch {
    return { ...FALLBACK_SCORE };
  }
}
