/**
 * historical-runner.ts
 * Sprint-062: Full pipeline — Wikimedia → Claude Vision brief → Kling animation → Supabase.
 *
 * Usage:
 *   npm run briefs:history           → animate + store in DB (LIVE)
 *   npm run briefs:history:test      → dry-run (no DB writes, no animation)
 *   npm run briefs:maps              → maps only
 *   npm run briefs:paintings         → paintings only
 *
 * Requires in ~/kognai/.env:
 *   ANTHROPIC_API_KEY    (Claude Vision brief generation)
 *   FAL_KEY              (Kling/Hailuo animation — optional, falls back to Ken Burns)
 *   SUPABASE_URL         (brief storage)
 *   SUPABASE_ANON_KEY
 */

import './env.js';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

import { fetchCategoryImages, searchWikimediaImages, type WikimediaImage } from './wikimedia-client.js';
import { buildHistoricalBrief } from './historical-brief-builder.js';
import { animateImage } from './kling-animator.js';

const SPRINT    = 'sprint-062';
const DOWNLOADS = resolve(process.env.HOME ?? '/Users/tarekmnif', 'kognai', 'downloads');
const DELAY_MS  = 800; // between Claude Vision calls

// ── Query catalogue ──────────────────────────────────────────────────────────
// Primary strategy: Wikimedia Commons CATEGORY lookup (curated, always JPEG/PNG).
// Fallback: full-text search (less reliable — may return SVGs).
// Categories verified to exist and contain high-quality JPEG images on Commons.
const HISTORICAL_QUERIES = [
  // ── Maps (category-based — highest precision) ───────────────────────────
  {
    id: 'map_london',
    category: 'Old maps of London',
    fallbackQuery: 'old map London 1700 city plan engraving',
    type: 'map',
  },
  {
    id: 'map_paris',
    category: 'Old maps of Paris',
    fallbackQuery: 'old map Paris 1789 historical plan city',
    type: 'map',
  },
  {
    id: 'map_rome',
    category: 'Historical maps of Rome',
    fallbackQuery: 'historical map Rome ancient city plan',
    type: 'map',
  },
  {
    id: 'map_istanbul',
    category: 'Historical maps of Istanbul',
    fallbackQuery: 'historical map Constantinople Ottoman city',
    type: 'map',
  },
  {
    id: 'map_new_york',
    category: 'Old maps of New York City',
    fallbackQuery: 'old map New York Manhattan 1800 city plan',
    type: 'map',
  },
  {
    id: 'map_venice',
    category: 'Historical maps of Venice',
    fallbackQuery: 'historical map Venice Venezia panorama city',
    type: 'map',
  },
  {
    id: 'map_amsterdam',
    category: 'Historical maps of Amsterdam',
    fallbackQuery: 'historical map Amsterdam 1600 bird-eye city',
    type: 'map',
  },
  // ── City paintings ──────────────────────────────────────────────────────
  {
    id: 'painting_pompeii',
    category: 'Paintings of Pompeii',
    fallbackQuery: 'Pompeii ancient city ruins painting volcano',
    type: 'painting',
  },
  {
    id: 'painting_rome',
    category: 'Paintings of ancient Rome',
    fallbackQuery: 'ancient Rome forum painting city reconstruction',
    type: 'painting',
  },
  {
    id: 'painting_venice',
    category: 'Paintings of Venice',
    fallbackQuery: 'Venice painting veduta historical canal city',
    type: 'painting',
  },
  {
    id: 'painting_cairo',
    category: 'Paintings of Cairo',
    fallbackQuery: 'Cairo Egypt historical painting orientalist 1800',
    type: 'painting',
  },
  {
    id: 'painting_jerusalem',
    category: 'Paintings of Jerusalem',
    fallbackQuery: 'Jerusalem historical painting holy city landscape',
    type: 'painting',
  },
] as const;

type QueryEntry = typeof HISTORICAL_QUERIES[number];

// ── Supabase ─────────────────────────────────────────────────────────────────

function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  return createClient(url, key);
}

// ── Main runner ──────────────────────────────────────────────────────────────

export interface HistoricalRunConfig {
  topics?: ('map' | 'painting')[];  // default: both
  perQuery?: number;                 // images per query (default: 3)
  dryRun?: boolean;                  // skip DB writes + skip animation
  sprintId?: string;
}

export async function runHistoricalBriefs(config: HistoricalRunConfig = {}): Promise<void> {
  const topics   = config.topics ?? ['map', 'painting'];
  const perQuery = config.perQuery ?? 3;
  const dryRun   = config.dryRun ?? false;
  const sprintId = config.sprintId ?? SPRINT;

  await mkdir(DOWNLOADS, { recursive: true });

  const queries = HISTORICAL_QUERIES.filter(q => topics.includes(q.type));
  console.log(`\n=== HISTORY MAKER (${topics.join('+')} | ${dryRun ? 'DRY RUN' : 'LIVE'} | Sprint: ${sprintId}) ===`);
  console.log(`Queries: ${queries.length} | Per query: ${perQuery} | FAL_KEY: ${process.env.FAL_KEY ? '✓' : 'absent (Ken Burns fallback)'}`);

  const db = dryRun ? null : getDb();
  let generated = 0, stored = 0;

  for (const entry of queries) {
    console.log(`\n[${entry.id}] Category: "${entry.category}"`);

    let images: WikimediaImage[] = [];
    try {
      // Primary: category lookup (curated, always returns correct image types)
      images = await fetchCategoryImages(entry.category, perQuery);
      if (images.length) {
        console.log(`  🖼  Found ${images.length} image(s) via category`);
      } else {
        // Fallback: full-text search
        console.log(`  ⚠️  Category empty — falling back to text search`);
        images = await searchWikimediaImages(entry.fallbackQuery, perQuery);
        if (images.length) {
          console.log(`  🖼  Found ${images.length} image(s) via search`);
        }
      }
    } catch (err) {
      console.error(`  ✗ Wikimedia lookup failed: ${String(err)}`);
      continue;
    }

    if (!images.length) {
      console.log(`  ⏭  No usable images found (filtered for JPEG/PNG ≥600px)`);
      continue;
    }

    for (const image of images) {
      const imageHash = createHash('md5').update(image.sourceUrl).digest('hex').slice(0, 8);
      const videoFilename = `wikimedia_${imageHash}.mp4`;
      const videoPath = resolve(DOWNLOADS, videoFilename);

      try {
        // Step 1: Claude Vision → generate TikTok brief
        console.log(`  🤖 Brief: "${image.title.slice(5, 60)}…"`);
        const brief = await buildHistoricalBrief(image);
        console.log(`  ✓ Hook: "${brief.hook}" | Trigger: ${brief.viral_trigger}`);

        generated++;

        if (dryRun) {
          console.log(`  [dry-run] Would animate → ${videoFilename}`);
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        // Step 2: Animate with Kling (or Ken Burns fallback)
        const anim = await animateImage(image.imageUrl, videoPath, motionPromptFor(brief.topic_name));
        console.log(`  🎬 Animated: ${anim.model} | ${anim.durationSeconds}s | cost $${anim.costUsd.toFixed(3)}`);

        // Step 3: Store brief in tiktok_briefs (reuse existing table + compose pipeline)
        const row = {
          video_source:       'wikimedia',
          video_id:           String(image.pageId),
          video_download_url: anim.videoPath,   // local absolute path — compose-runner checks this
          ia_identifier:      null,
          topic_id:           `historical_${entry.type}`,
          topic_name:         brief.topic_name,
          source_url:         image.sourceUrl,
          source_title:       image.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''),
          hook:               brief.hook,
          caption:            brief.caption,
          hashtags:           brief.hashtags,
          music_direction:    brief.music_direction,
          duration_seconds:   anim.durationSeconds,
          platform:           'tiktok',
          viral_trigger:      brief.viral_trigger,
          score:              75,   // placeholder; no Vision scorer for history yet
          status:             'draft',
          clip_status:        'pending',
          sprint_id:          sprintId,
        };

        const { data, error } = await db!
          .from('tiktok_briefs')
          .insert(row)
          .select('id')
          .single();

        if (error) throw new Error(`DB insert failed: ${error.message}`);
        stored++;
        console.log(`  💾 Stored brief ${data.id} → ${videoFilename}`);

      } catch (err) {
        console.error(`  ✗ [${image.pageId}] ${String(err)}`);
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n✅ Generated: ${generated} | Stored: ${stored}`);
}

/**
 * Return a motion prompt tailored to the topic for better Kling results.
 * Slow drifts work well for maps; more dynamic for city paintings.
 */
function motionPromptFor(topicName: string): string {
  const lower = topicName.toLowerCase();
  if (lower.includes('map') || lower.includes('plan')) {
    return 'slow cinematic zoom into map revealing street details, slight drift, documentary style';
  }
  if (lower.includes('rome') || lower.includes('ancient') || lower.includes('babylon')) {
    return 'epic cinematic flyover of ancient city, slow pull back to reveal scale, golden light';
  }
  if (lower.includes('venice') || lower.includes('amsterdam')) {
    return 'smooth gliding along waterways, reflections shimmering, slow pan across city';
  }
  return 'slow cinematic camera drift across historical scene, revealing fine detail, golden hour';
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun   = process.argv.includes('--dry-run');
  const mapsOnly = process.argv.includes('--topic=maps');
  const paintOnly = process.argv.includes('--topic=paintings');

  const topics: ('map' | 'painting')[] = mapsOnly
    ? ['map']
    : paintOnly
      ? ['painting']
      : ['map', 'painting'];

  runHistoricalBriefs({ topics, dryRun })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
