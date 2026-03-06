/**
 * brief-generator.ts
 * Uses Claude (claude-3-5-haiku) to generate structured TikTok briefs
 * from Internet Archive item metadata + viral topic config.
 */

import Anthropic from '@anthropic-ai/sdk';
import { VIRAL_TOPICS } from '../../ia-scraper/src/viral-topics.js';
import type { StoredItem } from '../../ia-scraper/src/storage.js';
import type { TikTokBrief } from './briefs-storage.js';

const MODEL = 'claude-haiku-4-5-20251001';

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY must be set');
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

interface BriefPayload {
  hook: string;
  caption: string;
  hashtags: string[];
  music_direction: string;
  duration_seconds: number;
  viral_trigger: string;
}

function buildPrompt(item: StoredItem, topicName: string, triggers: string[], captionStrategy: string, musicGenre: string): string {
  return `You are a TikTok content strategist specializing in viral archival footage.

SOURCE MATERIAL:
Title: ${item.title}
Description: ${item.description ? item.description.substring(0, 300) : 'N/A'}
Archive URL: ${item.source_url}
Topic niche: ${topicName}
Viral triggers: ${triggers.join(', ')}
Caption strategy from research: ${captionStrategy}
Music direction from research: ${musicGenre}
Viral score: ${item.score}/100

Generate a TikTok content brief as a JSON object with EXACTLY these fields:
{
  "hook": "<5-8 words max. On-screen text for first 3 seconds. Must stop the scroll immediately. Use a shocking fact, question, or statement that creates instant curiosity>",
  "caption": "<100-180 characters. Engaging TikTok caption that matches the hook energy. Include 1-2 line breaks. No hashtags here>",
  "hashtags": ["<5-8 strings WITHOUT the # symbol. Mix 2-3 niche hashtags + 2-3 broad trending hashtags relevant to this content>"],
  "music_direction": "<2 sentences max. Specific genre, tempo (BPM range), mood, and a royalty-free style reference that fits the clip's emotional tone>",
  "duration_seconds": <integer between 15 and 34 — optimal TikTok length for this content type>,
  "viral_trigger": "<exactly one word from: awe, shock, amusement, inspiration, nostalgia, curiosity, satisfaction, debate>"
}

Return ONLY the JSON object. No markdown, no explanation, no extra text.`;
}

async function parseWithRetry(client: Anthropic, prompt: string, identifier: string): Promise<BriefPayload> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(clean) as BriefPayload;
    } catch {
      if (attempt === 2) throw new Error(`Invalid JSON from Claude for "${identifier}" after 2 attempts: ${text.substring(0, 100)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}

/** Generate a TikTokBrief for a single IA item using Claude. */
export async function generateBrief(item: StoredItem, sprintId: string): Promise<TikTokBrief> {
  const topic = VIRAL_TOPICS.find(t => t.id === item.topic_id);
  const topicName = topic?.name ?? item.topic_id ?? 'Unknown';
  const triggers = topic?.triggers ?? [];
  const captionStrategy = topic?.caption_strategy ?? '';
  const musicGenre = topic?.music_genre ?? '';
  const platform = topic?.platform_priority[0] ?? 'tiktok';

  const client = getClient();
  const prompt = buildPrompt(item, topicName, triggers, captionStrategy, musicGenre);
  const parsed = await parseWithRetry(client, prompt, item.identifier);

  return {
    ia_identifier: item.identifier,
    topic_id: item.topic_id ?? '',
    topic_name: topicName,
    source_url: item.source_url,
    source_title: item.title,
    hook: parsed.hook,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    music_direction: parsed.music_direction,
    duration_seconds: Math.max(15, Math.min(34, parsed.duration_seconds)),
    platform,
    viral_trigger: parsed.viral_trigger,
    score: item.score,
    status: 'draft',
    sprint_id: sprintId,
  };
}
