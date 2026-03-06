/**
 * brief-runner.ts
 * Pulls top IA items, generates TikTok briefs via Claude, stores to Supabase.
 *
 * Usage:
 *   npm test                       → dry run, top 20 items (score >= 40)
 *   npm run run                    → live run, generates + stores briefs
 *   npm run run -- --topic=T03     → only process T03 Historical items
 */

import './env.js';
import { getTopUnused, markUsed } from '../../ia-scraper/src/storage.js';
import { generateBrief } from './brief-generator.js';
import { insertBrief, type TikTokBrief } from './briefs-storage.js';

const DELAY_MS = 600; // between Claude calls

export interface BriefRunConfig {
  limit?: number;
  sprint_id: string;
  dry_run?: boolean;
  topic_filter?: string;
  min_score?: number;
}

export interface BriefRunResult {
  processed: number;
  briefs_generated: number;
  briefs_stored: number;
  errors: string[];
  duration_ms: number;
  briefs: TikTokBrief[];
}

export async function runBriefGenerator(config: BriefRunConfig): Promise<BriefRunResult> {
  const start = Date.now();
  const minScore = config.min_score ?? 40;
  const errors: string[] = [];
  const briefs: TikTokBrief[] = [];

  // Pull unused IA items, filter by score and optional topic
  const raw = await getTopUnused(config.limit ?? 20);
  const items = raw.filter(i =>
    i.score >= minScore &&
    (!config.topic_filter || i.topic_id === config.topic_filter)
  );

  console.log(`[brief-runner] Processing ${items.length} items (score >= ${minScore}${config.topic_filter ? `, topic=${config.topic_filter}` : ''})`);

  for (const item of items) {
    try {
      const brief = await generateBrief(item, config.sprint_id);
      briefs.push(brief);

      console.log(`\n  ✓ [${item.topic_id}] "${item.title}"`);
      console.log(`    HOOK:     ${brief.hook}`);
      console.log(`    CAPTION:  ${brief.caption.substring(0, 80).replace(/\n/g, ' ')}...`);
      console.log(`    TAGS:     #${brief.hashtags.slice(0, 4).join(' #')}`);
      console.log(`    MUSIC:    ${brief.music_direction.substring(0, 70)}...`);
      console.log(`    ${brief.duration_seconds}s | ${brief.platform} | trigger: ${brief.viral_trigger}`);

      if (!config.dry_run) {
        await insertBrief(brief);
        await markUsed(item.identifier);
      }
    } catch (err) {
      const msg = `[${item.topic_id}] "${item.title}": ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }

    if (items.indexOf(item) < items.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return {
    processed: items.length,
    briefs_generated: briefs.length,
    briefs_stored: config.dry_run ? 0 : briefs.length - errors.length,
    errors,
    duration_ms: Date.now() - start,
    briefs,
  };
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const topicFilter = process.argv.find(a => a.startsWith('--topic='))?.split('=')[1];

  console.log(`\n=== BRIEF GENERATOR START ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} | Topic: ${topicFilter ?? 'all'}`);

  runBriefGenerator({ limit: 20, min_score: 40, sprint_id: 'sprint-053', dry_run: isDryRun, topic_filter: topicFilter })
    .then(r => {
      console.log(`\n=== DONE (${(r.duration_ms / 1000).toFixed(1)}s) ===`);
      console.log(`Processed: ${r.processed} | Generated: ${r.briefs_generated} | Stored: ${r.briefs_stored}`);
      if (r.errors.length) console.log('Errors:', r.errors);
    })
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
