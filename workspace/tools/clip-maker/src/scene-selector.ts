/**
 * scene-selector.ts
 * Uses Claude to pick the best viral segment from an IA transcript
 * and generate a storytelling narration script timed to the clip.
 */

import './env.js';
import Anthropic from '@anthropic-ai/sdk';
import type { SrtSegment } from './ia-srt-fetcher.js';
import { transcriptText } from './ia-srt-fetcher.js';

const MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY must be set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface NarrationSegment {
  text: string;   // 3-7 words, storytelling line
  start: number;  // seconds from clip start (0-based)
  end: number;
}

export interface SceneSelection {
  start_seconds: number;
  summary: string;
  narration: NarrationSegment[];
}

interface BriefContext {
  title: string;
  hook: string;
  topic_name: string;
  duration_seconds: number;
  viral_trigger: string;
  frameBase64?: string;  // base64 JPEG frame extracted from the actual video
}

function buildPrompt(brief: BriefContext, transcript: SrtSegment[]): string {
  const dur = brief.duration_seconds;
  const hasTranscript = transcript.length > 0;
  const hasFrame = !!brief.frameBase64;
  const transcriptBlock = hasTranscript
    ? `TRANSCRIPT (with timestamps in seconds):\n${transcriptText(transcript).split('\n').slice(0, 120).join('\n')}`
    : hasFrame
      ? `TRANSCRIPT: None — but you are seeing an actual frame from this video above. Describe ONLY what you literally see in the frame when writing narration.`
      : `TRANSCRIPT: None available (silent film or no audio)`;

  // Distribute narration evenly across clip
  const segCount = 6;
  const segDur = dur / segCount;
  const exampleNarration = Array.from({ length: segCount }, (_, i) => ({
    text: `<line ${i + 1}: 3-7 dramatic words>`,
    start: Math.round(i * segDur),
    end: Math.round((i + 1) * segDur),
  }));

  return `You are a TikTok viral video editor specializing in archival footage.

VIDEO: ${brief.title}
TOPIC: ${brief.topic_name}
HOOK: ${brief.hook}
CLIP LENGTH: ${dur}s
VIRAL TRIGGER: ${brief.viral_trigger}

${transcriptBlock}

TASK:
1. ${hasTranscript ? `Find the most shocking/awe-inspiring ${dur}-second window in the transcript` : `Suggest a start time (skip first 8s for intros)`}
2. Write a ${dur}s storytelling narration script — ${segCount} short segments, present tense, dramatic TikTok style

Return JSON only:
{
  "start_seconds": <integer>,
  "summary": "<1 sentence: what happens here>",
  "narration": ${JSON.stringify(exampleNarration, null, 2)}
}

Narration rules:
- First segment always: start=0, end=${Math.round(segDur)} (the hook moment)
- Each segment: STRICT MAX 6 words — count them, never exceed 6. No exceptions.
- Style: "In 1940..." / "Scientists discovered..." / "This changed EVERYTHING"
- Return ONLY valid JSON.`;
}

export async function selectScene(
  identifier: string,
  transcript: SrtSegment[],
  brief: BriefContext,
  fallbackStart = 8,
): Promise<SceneSelection> {
  const client = getClient();
  const prompt = buildPrompt(brief, transcript);

  for (let attempt = 1; attempt <= 2; attempt++) {
    // When a real video frame is available, send it as a Vision message
    // so Claude narrates what's actually on screen — not what the brief says.
    const userContent = brief.frameBase64
      ? [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: 'image/jpeg' as const,
              data: brief.frameBase64,
            },
          },
          { type: 'text' as const, text: prompt },
        ]
      : prompt;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: userContent }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    try {
      const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean) as SceneSelection;
      if (typeof parsed.start_seconds !== 'number') parsed.start_seconds = fallbackStart;
      if (!Array.isArray(parsed.narration) || parsed.narration.length < 3) throw new Error('bad narration');
      return parsed;
    } catch {
      if (attempt === 2) {
        // Hard fallback
        return {
          start_seconds: fallbackStart,
          summary: brief.title,
          narration: Array.from({ length: 6 }, (_, i) => ({
            text: brief.hook.split(' ').slice(i * 1, i * 1 + 4).join(' ') || brief.hook,
            start: Math.round(i * (brief.duration_seconds / 6)),
            end: Math.round((i + 1) * (brief.duration_seconds / 6)),
          })),
        };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}
