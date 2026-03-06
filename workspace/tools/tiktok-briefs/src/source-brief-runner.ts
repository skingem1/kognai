/**
 * source-brief-runner.ts
 * Sprint-057: generates TikTok briefs from Pexels + Pixabay per viral topic.
 *
 * Usage:
 *   npm run briefs:pexels           → generate from Pexels (draft)
 *   npm run briefs:pixabay          → generate from Pixabay (draft)
 *   npm run briefs:sources          → both sources
 *   npm run briefs:sources:test     → dry-run (no DB writes)
 *
 * Requires: PEXELS_API_KEY and/or PIXABAY_API_KEY in ~/kognai/.env
 */

import './env.js';
import Anthropic from '@anthropic-ai/sdk';
import { searchPexels } from './pexels-client.js';
import { searchPixabay } from './pixabay-client.js';
import { VIRAL_TOPICS } from '../../ia-scraper/src/viral-topics.js';
import { STOCK_QUERIES, type VideoSourceItem, type VideoSourceName } from './video-source-types.js';
import { insertBrief, type TikTokBrief } from './briefs-storage.js';

const MODEL  = 'claude-haiku-4-5-20251001';
const SPRINT = 'sprint-061';
const DELAY  = 700; // ms between Claude calls

// The 5 proven hook formulas from viral structure research.
// One is picked per brief to ensure structural variety.
const HOOK_FORMULAS = [
  'Bold Claim — lead with the single most shocking fact about this topic.',
  'Curiosity Gap — imply there is something critical nobody talks about, without revealing it.',
  'Micro-Story — drop the viewer mid-action with no intro. Start as if something just happened.',
  'Visual Shock — write the single most jarring, specific, concrete detail visible or implied.',
  'Direct Question — ask the viewer a question that makes them doubt what they thought they knew.',
] as const;

let _anthropic: Anthropic | null = null;
const getAI = () => {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
};

function buildPrompt(item: VideoSourceItem, topicName: string, triggers: string[], captionStrategy: string, musicGenre: string): string {
  // Pick a hook formula at random — enforces structural variety across briefs
  const hookFormula = HOOK_FORMULAS[Math.floor(Math.random() * HOOK_FORMULAS.length)];

  return `You are a TikTok content strategist specialising in viral short-form video.

SOURCE MATERIAL:
Title: ${item.title}
Description: ${item.description ?? 'Contemporary HD stock footage'}
Duration: ${item.duration}s | Resolution: ${item.width}x${item.height}
Topic niche: ${topicName}
Viral triggers: ${triggers.join(', ')}
Caption strategy: ${captionStrategy}
Music direction: ${musicGenre}

Generate a TikTok content brief as a JSON object with EXACTLY these fields:
{
  "hook": "<STRICT MAX 6 words. Hook formula to use: ${hookFormula} — Do NOT use an intro, greeting, or setup. The first word must be a hook word that stops the scroll cold. No punctuation beyond a single ? or !>",
  "caption": "<100-180 characters. Engaging TikTok caption matching the hook energy. No hashtags>",
  "hashtags": ["<5-8 strings WITHOUT #. Mix 2-3 niche + 2-3 broad trending hashtags>"],
  "music_direction": "<2 sentences max. Specific genre, tempo, mood matching the clip's emotional tone>",
  "duration_seconds": <integer 21-34 — TikTok storytelling sweet spot>,
  "viral_trigger": "<exactly one: awe | shock | amusement | inspiration | nostalgia | curiosity | satisfaction | debate>"
}

Return ONLY the JSON object. No markdown, no explanation.`;
}

async function generateFromItem(item: VideoSourceItem, sprintId: string): Promise<TikTokBrief> {
  const topic = VIRAL_TOPICS.find(t => t.id === item.topic_id);
  const topicName       = topic?.name               ?? item.topic_id;
  const triggers        = topic?.triggers            ?? [];
  const captionStrategy = topic?.caption_strategy    ?? '';
  const musicGenre      = topic?.music_genre         ?? '';
  const platform        = topic?.platform_priority[0] ?? 'tiktok';

  const prompt = buildPrompt(item, topicName, triggers, captionStrategy, musicGenre);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const msg = await getAI().messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    try {
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      return {
        ia_identifier: undefined,
        video_source: item.source,
        video_id: item.video_id,
        video_download_url: item.download_url,
        topic_id: item.topic_id,
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
    } catch {
      if (attempt === 2) throw new Error(`Invalid JSON for item ${item.video_id}: ${text.substring(0, 100)}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('unreachable');
}

export interface SourceRunConfig {
  sources?: VideoSourceName[];  // default: ['pexels', 'pixabay']
  topics?: string[];            // default: all STOCK_QUERIES keys
  perTopic?: number;            // videos per topic per source (default 5)
  sprintId?: string;
  dryRun?: boolean;
}

export async function runSourceBriefs(config: SourceRunConfig = {}): Promise<void> {
  const sources     = config.sources  ?? ['pexels', 'pixabay'];
  const topicIds    = config.topics   ?? Object.keys(STOCK_QUERIES);
  const perTopic    = config.perTopic ?? 5;
  const sprintId    = config.sprintId ?? SPRINT;
  let generated = 0, stored = 0;

  for (const topicId of topicIds) {
    const queries = STOCK_QUERIES[topicId];
    if (!queries?.length) continue;
    const query = queries[0]; // use primary query

    const items: VideoSourceItem[] = [];
    for (const src of sources) {
      try {
        if (src === 'pexels')   items.push(...await searchPexels(query, topicId, perTopic));
        if (src === 'pixabay')  items.push(...await searchPixabay(query, topicId, perTopic));
      } catch (err) {
        console.error(`  ✗ [${topicId}] ${src}: ${String(err)}`);
      }
    }

    // Sort by score desc — take top perTopic results overall
    const top = items.sort((a, b) => b.score - a.score).slice(0, perTopic);

    for (const item of top) {
      try {
        const brief = await generateFromItem(item, sprintId);
        generated++;
        console.log(`  ✓ [${topicId}/${item.source}] "${brief.hook}"`);
        if (!config.dryRun) { await insertBrief(brief); stored++; }
        await new Promise(r => setTimeout(r, DELAY));
      } catch (err) {
        console.error(`  ✗ [${topicId}] ${item.video_id}: ${String(err)}`);
      }
    }
  }

  console.log(`\n✅ Generated: ${generated} | Stored: ${stored}`);
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  const pexelOnly  = process.argv.includes('--pexels');
  const pixabayOnly = process.argv.includes('--pixabay');
  const sources: VideoSourceName[] = pexelOnly ? ['pexels'] : pixabayOnly ? ['pixabay'] : ['pexels', 'pixabay'];

  // Dry-run: skip Vision API calls to keep test runs fast and cheap
  if (dryRun) process.env.SKIP_VISION_SCORING = '1';

  const visionStatus = dryRun ? 'SKIPPED (dry-run)' : 'ACTIVE';
  console.log(`\n=== SOURCE BRIEF RUNNER (${sources.join('+')} | ${dryRun ? 'DRY RUN' : 'LIVE'} | Vision: ${visionStatus}) ===`);
  runSourceBriefs({ sources, dryRun })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
