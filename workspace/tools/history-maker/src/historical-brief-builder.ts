/**
 * historical-brief-builder.ts
 * Sprint-062: Claude Vision analyzes a painting/map and generates a TikTok brief.
 *
 * Downloads the thumbnail to memory and sends as base64 — avoids Wikimedia CDN
 * blocking issues that occur with URL-based loading. Same approach as compose-runner
 * extractFrame() → base64 → Claude Vision.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WikimediaImage } from './wikimedia-client.js';

const MODEL = 'claude-haiku-4-5-20251001';

export interface HistoricalBrief {
  hook: string;             // MAX 6 words — scroll-stopping opener
  caption: string;          // 100–180 chars TikTok caption
  hashtags: string[];       // 5–8 tags without #
  music_direction: string;  // 2-sentence music suggestion
  viral_trigger: string;    // awe | shock | curiosity | inspiration | nostalgia | satisfaction
  topic_name: string;       // e.g. "Ancient Rome" or "Medieval London"
  duration_seconds: number; // 8–10
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY must be set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

const HOOK_FORMULAS = [
  'Bold Claim — the single most shocking historical fact visible or implied by this artwork.',
  'Curiosity Gap — imply something critical that nobody knows about this place/era, without revealing it.',
  'Micro-Story — drop the viewer mid-action: describe one vivid specific moment happening in this scene.',
  'Visual Shock — the single most jarring, concrete, specific detail visible in this artwork.',
  'Direct Question — ask the viewer something that makes them doubt what they think they know about this era.',
] as const;

function buildPrompt(image: WikimediaImage): string {
  const hookFormula = HOOK_FORMULAS[Math.floor(Math.random() * HOOK_FORMULAS.length)];

  return `You are a TikTok viral content strategist specialising in historical content.

You are looking at a historical painting or map from Wikimedia Commons:
Title: ${image.title}
Page: ${image.sourceUrl}

Generate a TikTok content brief based on what you literally see in the image above.
Do NOT make up facts you can't see — only reference what is visually present.

Hook formula to use: ${hookFormula}

Return ONLY valid JSON (no markdown, no explanation):
{
  "hook": "<STRICT MAX 6 words. First word must stop the scroll. No greetings, no intros, no 'today'>",
  "caption": "<100-180 characters. Match the hook energy. No hashtags>",
  "hashtags": ["<5-8 strings WITHOUT #. Mix 2-3 niche (e.g. ancientrome, historicalmaps) + 2-3 broad (history, AIHistory, TimeTravel)>"],
  "music_direction": "<2 sentences. Specific genre, tempo, mood that matches this artwork's emotional tone>",
  "viral_trigger": "<exactly one: awe | shock | curiosity | inspiration | nostalgia | satisfaction>",
  "topic_name": "<2-4 words identifying the historical subject, e.g. 'Medieval London', 'Ancient Rome', 'Renaissance Florence'>",
  "duration_seconds": <integer 8-10>
}`;
}

/**
 * Download image to memory as base64.
 * Returns null if the download fails or the content is not an image.
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Kognai/1.0 (history-maker; kognai-bot)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    // Accept JPEG and PNG — Wikimedia thumbs are always JPEG regardless of source
    const isImage = contentType.startsWith('image/jpeg') || contentType.startsWith('image/png') || contentType.startsWith('image/');
    if (!isImage) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    // Detect actual format from magic bytes (Wikimedia CDN may mislabel content-type)
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const mediaType = isJpeg ? 'image/jpeg' : 'image/png';
    return { data: buf.toString('base64'), mediaType };
  } catch {
    return null;
  }
}

/**
 * Send the painting thumbnail to Claude Vision (as base64) and generate a TikTok brief.
 * Falls back to thumbnail → full image URL if the first download fails.
 * Throws only if both URLs fail — runner catches this and skips the image.
 */
export async function buildHistoricalBrief(image: WikimediaImage): Promise<HistoricalBrief> {
  // Try thumb first (smaller, faster), then full image URL
  const imageData = await fetchImageAsBase64(image.thumbUrl)
    ?? await fetchImageAsBase64(image.imageUrl);

  if (!imageData) {
    throw new Error(`Image download failed — skipping: ${image.title.slice(0, 60)}`);
  }

  const client = getClient();
  const prompt = buildPrompt(image);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mediaType as 'image/jpeg' | 'image/png',
                data: imageData.data,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    try {
      const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean) as HistoricalBrief;
      if (!parsed.hook || !parsed.viral_trigger || !parsed.topic_name) {
        throw new Error('Missing required fields');
      }
      parsed.duration_seconds = Math.max(8, Math.min(10, parsed.duration_seconds ?? 10));
      return parsed;
    } catch {
      if (attempt === 2) {
        // Hard fallback: Claude parsed nothing useful — use metadata-based brief
        return {
          hook: image.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').split(/[_\s-]/).slice(0, 5).join(' '),
          caption: `Step inside this remarkable piece of history. What you see here changed the world.`,
          hashtags: ['history', 'AIHistory', 'historicalmaps', 'TimeTravel', 'ancientworld'],
          music_direction: 'Epic orchestral, slow build, 60–80 BPM. Convey timeless grandeur.',
          viral_trigger: 'awe',
          topic_name: 'Historical World',
          duration_seconds: 10,
        };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}
