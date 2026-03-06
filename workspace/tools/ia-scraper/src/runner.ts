/**
 * runner.ts
 * Orchestrates the full IA scraper pipeline.
 * Driven by VIRAL_TOPICS from viral-topics.ts.
 *
 * Usage:
 *   npm test           → dry run, top 10 topics
 *   npm run run        → live run, top 10 topics (writes to Supabase)
 *   npm run run:all    → live run, all 30 topics
 */

import { config } from 'dotenv';
import { resolve } from 'path';
// Load from vault .env (works from any CWD)
config({ path: resolve(process.env.HOME ?? '~', 'kognai', '.env') });
import { VIRAL_TOPICS, TOP_10_TOPICS, type TopicConfig } from './viral-topics.js';
import { searchByTopic, type IAItem } from './ia-client.js';
import { scoreItem, type ScoredItem } from './content-scorer.js';
import { upsertItems } from './storage.js';

export interface RunConfig {
  topics?: TopicConfig[];
  top_n_topics?: number;
  rows_per_query?: number;
  min_score?: number;
  sprint_id: string;
  dry_run?: boolean;
}

export interface TopicResult {
  topic_id: string;
  topic_name: string;
  items_fetched: number;
  items_stored: number;
  top_item?: ScoredItem;
}

export interface RunResult {
  topics_run: number;
  items_fetched: number;
  items_scored: number;
  items_stored: number;
  per_topic: TopicResult[];
  top_items: ScoredItem[];
  errors: string[];
  duration_ms: number;
}

export async function runScraper(config: RunConfig): Promise<RunResult> {
  const start = Date.now();
  const topics = config.topics
    ?? (config.top_n_topics != null ? VIRAL_TOPICS.slice(0, config.top_n_topics) : TOP_10_TOPICS);
  const minScore = config.min_score ?? 30;
  const rowsPerQuery = config.rows_per_query ?? 50;

  const globalSeen = new Map<string, ScoredItem>(); // identifier → best scored item
  const perTopic: TopicResult[] = [];
  const errors: string[] = [];
  let totalFetched = 0;

  for (const topic of topics) {
    console.log(`\n[runner] Topic ${topic.id} (${topic.rank}/30): ${topic.name}`);
    let rawItems: IAItem[] = [];
    try {
      rawItems = await searchByTopic(topic, rowsPerQuery);
    } catch (err) {
      const msg = `${topic.id}: fetch failed — ${String(err)}`;
      errors.push(msg);
      console.error(`  ✗ ${msg}`);
      perTopic.push({ topic_id: topic.id, topic_name: topic.name, items_fetched: 0, items_stored: 0 });
      continue;
    }

    totalFetched += rawItems.length;
    const scored = rawItems.map(scoreItem).filter(i => !i.disqualified && i.score >= (topic.min_score ?? minScore));

    // Deduplicate globally — keep higher score
    for (const item of scored) {
      const existing = globalSeen.get(item.identifier);
      if (!existing || item.score > existing.score) globalSeen.set(item.identifier, item);
    }

    let stored = 0;
    if (!config.dry_run && scored.length > 0) {
      try {
        const result = await upsertItems(scored, config.sprint_id);
        stored = result.inserted;
      } catch (err) {
        errors.push(`${topic.id}: upsert failed — ${String(err)}`);
      }
    } else if (config.dry_run) {
      stored = scored.length; // count as stored for dry run reporting
    }

    const topItem = scored.sort((a, b) => b.score - a.score)[0];
    perTopic.push({ topic_id: topic.id, topic_name: topic.name, items_fetched: rawItems.length, items_stored: stored, top_item: topItem });
    console.log(`  ✓ fetched=${rawItems.length} scored=${scored.length} stored=${stored}${topItem ? ` top="${topItem.title}" (${topItem.score})` : ''}`);
  }

  const allScored = Array.from(globalSeen.values());
  const top_items = allScored.sort((a, b) => b.score - a.score).slice(0, 5);
  const items_stored = perTopic.reduce((s, t) => s + t.items_stored, 0);

  return {
    topics_run: topics.length,
    items_fetched: totalFetched,
    items_scored: allScored.length,
    items_stored,
    per_topic: perTopic,
    top_items,
    errors,
    duration_ms: Date.now() - start,
  };
}

// Entry point when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  const isAll = process.argv.includes('--all');
  const config: RunConfig = {
    top_n_topics: isAll ? undefined : 10,
    sprint_id: 'sprint-052',
    dry_run: isDryRun,
    min_score: 30,
  };

  console.log(`\n=== IA SCRAPER START ===`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} | Topics: ${isAll ? 'all 30' : 'top 10'}`);

  runScraper(config).then(r => {
    console.log(`\n=== RUN COMPLETE (${r.duration_ms}ms) ===`);
    console.log(`Topics: ${r.topics_run} | Fetched: ${r.items_fetched} | Scored: ${r.items_scored} | Stored: ${r.items_stored}`);
    if (r.errors.length) console.log('Errors:', r.errors);
    console.log('\nTop 5 items:');
    r.top_items.forEach((i, n) => console.log(`  ${n + 1}. [${i.topic_id}] ${i.title} — score: ${i.score} | ${i.source_url}`));
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
