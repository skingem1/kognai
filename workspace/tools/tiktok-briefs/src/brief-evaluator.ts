/**
 * brief-evaluator.ts
 * Claude GEval-inspired virality scoring gate for TikTok briefs.
 * Scores hook, caption, and hashtags before committing to video production.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TikTokBrief } from './briefs-storage.js';

const MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_THRESHOLD = 6.5;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY must be set');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export interface EvalScore {
  hook_virality: number;      // 0-10: punchy, curiosity-driving?
  caption_quality: number;    // 0-10: engaging, correct format?
  hashtag_relevance: number;  // 0-10: niche+broad mix, relevant?
  overall: number;            // average of above
  pass: boolean;              // overall >= threshold
  reasoning: string;          // 1-2 sentence explanation
}

export async function evaluateBrief(
  brief: TikTokBrief,
  threshold = DEFAULT_THRESHOLD,
): Promise<EvalScore> {
  const prompt = `You are a TikTok virality expert. Score this content brief on 3 criteria (0-10 each).

BRIEF:
Hook: ${brief.hook}
Caption: ${brief.caption}
Hashtags: #${brief.hashtags.join(' #')}
Platform: ${brief.platform}
Viral trigger: ${brief.viral_trigger}
Topic: ${brief.topic_name}

SCORING CRITERIA:
- hook_virality (0-10): Is the hook under 8 words? Does it create immediate curiosity/shock? Would you stop scrolling?
- caption_quality (0-10): Is the caption 100-200 chars? Does it have emotional engagement? Does it match the hook energy?
- hashtag_relevance (0-10): Mix of 2-3 niche + 2-3 broad hashtags? Relevant to the content? No spam tags?

Return JSON only:
{"hook_virality": N, "caption_quality": N, "hashtag_relevance": N, "reasoning": "..."}`;

  const msg = await getClient().messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(clean) as {
    hook_virality: number;
    caption_quality: number;
    hashtag_relevance: number;
    reasoning: string;
  };

  const overall = (parsed.hook_virality + parsed.caption_quality + parsed.hashtag_relevance) / 3;
  return {
    hook_virality: parsed.hook_virality,
    caption_quality: parsed.caption_quality,
    hashtag_relevance: parsed.hashtag_relevance,
    overall: Math.round(overall * 10) / 10,
    pass: overall >= threshold,
    reasoning: parsed.reasoning ?? '',
  };
}
