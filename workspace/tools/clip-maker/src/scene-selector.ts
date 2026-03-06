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
    ? `TRANSCRIPT (timestamps in seconds):\n${transcriptText(transcript).split('\n').slice(0, 120).join('\n')}`
    : hasFrame
      ? `TRANSCRIPT: None — you are seeing an actual frame from this video above. Base your narration ONLY on what you literally see in the frame.`
      : `TRANSCRIPT: None available.`;

  // 6 segments with explicit structural roles — evenly timed
  const segDur = dur / 6;
  const s = (i: number) => Math.round(i * segDur);

  const exampleNarration = [
    { text: '<HOOK — see role below>',             start: s(0), end: s(1), role: 'hook' },
    { text: '<OPEN LOOP — see role below>',         start: s(1), end: s(2), role: 'open_loop' },
    { text: '<VALUE DELIVERY — see role below>',    start: s(2), end: s(3), role: 'value_open' },
    { text: '<PEAK MOMENT — see role below>',       start: s(3), end: s(4), role: 'value_body' },
    { text: '<PATTERN INTERRUPT — see role below>', start: s(4), end: s(5), role: 'pattern_interrupt' },
    { text: '<CTA — see role below>',              start: s(5), end: dur,  role: 'cta' },
  ];

  return `You are a TikTok viral caption writer. Write exactly 6 narration segments for a ${dur}-second video. Each segment has a structural role — follow it precisely.

VIDEO CONTEXT:
Title: ${brief.title}
Topic: ${brief.topic_name}
Viral trigger: ${brief.viral_trigger}
Hook text from brief: ${brief.hook}

${transcriptBlock}

═══ SEGMENT ROLES (write in this exact order) ═══

[0] HOOK — ${s(0)}s to ${s(1)}s
The first word must stop the scroll. Use ONE of these formulas:
  • Bold Claim: the single most shocking fact about ${brief.topic_name}
  • Curiosity Gap: imply something critical nobody knows — WITHOUT revealing it
  • Micro-Story: start mid-action, no intro (e.g. "It happened in 3 seconds.")
  • Visual Shock: the most jarring, concrete, specific detail you can see or infer
  • Direct Question: make the viewer doubt what they already know
❌ Never use: intros, greetings, "today", "welcome", "in this video"
✅ MAX 6 words. Count them. No exceptions.

[1] OPEN LOOP — ${s(1)}s to ${s(2)}s
Create a question or promise that CANNOT be answered without watching more.
Do NOT reveal the answer. Use structures like:
  • "But what happened next was different..."
  • "The reason stunned even scientists..."
  • "Nobody predicted what came after..."
Rephrase using the voice of ${brief.topic_name} — do not copy these words verbatim.
✅ MAX 6 words.

[2] VALUE DELIVERY — ${s(2)}s to ${s(3)}s
Deliver the first piece of the hook's promise. Present tense. Reference the peak action.
This is what justifies watching past the 10-second mark.
✅ MAX 6 words.

[3] PEAK MOMENT — ${s(3)}s to ${s(4)}s
The single most emotionally intense moment. This is the climax — the thing viewers came for.
Must escalate from segment 2. Dramatic, specific, present tense.
✅ MAX 6 words.

[4] PATTERN INTERRUPT — ${s(4)}s to ${s(5)}s
A shocking statistic, contrast, or reframe. Start with a number or a contrast word.
Examples: "97% never witness this." / "This takes 3 seconds. Not centuries."
Must reframe what the viewer just saw in an unexpected way.
✅ MAX 6 words.

[5] CALL TO ACTION — ${s(5)}s to ${dur}s
Pick EXACTLY ONE of these three CTAs and adapt it to ${brief.topic_name}:
  • "Follow for more [topic] secrets."
  • "Save this — you will rewatch it."
  • "Comment if this surprised you."
Do NOT invent other formulas. Never use "like and subscribe."
✅ MAX 6 words.

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON — no markdown, no labels, no explanation:
{
  "start_seconds": ${hasTranscript ? '<integer: best viral window start>' : '0'},
  "summary": "<1 sentence: what the video literally shows>",
  "narration": ${JSON.stringify(exampleNarration, null, 2)}
}`;
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
      max_tokens: 1200,
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
