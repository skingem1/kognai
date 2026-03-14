#!/usr/bin/env ts-node
// Phase 1 — TikTok Content Agent | Full Pipeline Runner
// Section 05 Task #6 — Orchestrates: Scrape → Score → Caption → Post
// Usage: npx ts-node scripts/run-tiktok-pipeline.ts --query <text> [--max-results N] [--min-score N] [--count N] [--dry-run]

import { ArchiveScraper } from '../agents/archive-scraper/index';
import { VisionScorer } from '../agents/vision-scorer/index';
import { CaptionGenerator } from '../agents/caption-generator/index';
import { TikTokClient } from '../agents/tiktok-client/index';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const QUERY      = getArg('--query', 'vintage 1970s');
const MAX        = parseInt(getArg('--max-results', '20'), 10);
const MIN_SCORE  = parseInt(getArg('--min-score', '60'), 10);
const COUNT      = parseInt(getArg('--count', '5'), 10);
const DRY_RUN    = args.includes('--dry-run');

async function run() {
  console.log(`\n🚀 TikTok Content Pipeline`);
  console.log(`Query: "${QUERY}" | max: ${MAX} | minScore: ${MIN_SCORE} | count: ${COUNT} | dryRun: ${DRY_RUN}\n`);

  // Step 1: Scrape
  console.log('📦 Step 1: Scraping Internet Archive...');
  const t1 = Date.now();
  const scraper = new ArchiveScraper({ query: QUERY, maxResults: MAX, apiBaseUrl: 'https://archive.org' });
  const archiveResults = await scraper.scrape();
  console.log(`  ✓ ${archiveResults.length} items (${Date.now() - t1}ms)\n`);

  if (archiveResults.length === 0) {
    console.log('No archive results. Try a different query.'); process.exit(1);
  }

  // Step 2: Score
  console.log('🎯 Step 2: Vision scoring...');
  const t2 = Date.now();
  const scorer = new VisionScorer();
  const scoredItems = await scorer.scoreThumbnails(archiveResults.map(r => ({ id: r.id, url: r.url })));
  const eligible = scoredItems.filter(i => i.score >= MIN_SCORE);
  console.log(`  ✓ ${scoredItems.length} scored, ${eligible.length} above threshold (${Date.now() - t2}ms)\n`);

  if (eligible.length === 0) {
    console.log(`No items above minScore ${MIN_SCORE}. Lower --min-score.`); process.exit(1);
  }

  // Step 3: Caption
  console.log('✍️  Step 3: Generating captions...');
  const t3 = Date.now();
  const captionGen = new CaptionGenerator();
  const captioned = await captionGen.generateCaptions(eligible, COUNT);
  console.log(`  ✓ ${captioned.length} captions generated (${Date.now() - t3}ms)\n`);

  // Step 4: Post
  console.log(`📱 Step 4: Posting to TikTok${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  const t4 = Date.now();
  const tiktok = new TikTokClient();
  const results = [];

  for (const item of captioned) {
    const archiveItem = archiveResults.find(r => r.id === item.id);
    const mediaType = archiveItem?.mediaType?.startsWith('video') ? 'video' : 'photo';
    const result = await tiktok.post({ caption: item.caption, mediaUrl: item.url, mediaType, hashtags: item.hashtags, dryRun: DRY_RUN });
    results.push({ ...item, publishResult: result });
    const icon = result.status === 'success' ? '✓' : '✗';
    console.log(`  ${icon} [${result.status}] ${item.url.substring(0, 60)}`);
  }
  console.log(`  Done (${Date.now() - t4}ms)\n`);

  // Save
  const outDir = join(__dirname, '..', 'reports');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `tiktok-pipeline-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ query: QUERY, runAt: new Date().toISOString(), dryRun: DRY_RUN, results }, null, 2));
  const succeeded = results.filter(r => r.publishResult.status === 'success').length;
  console.log(`📊 Results saved: ${outPath}`);
  console.log(`\n✅ Pipeline complete: ${succeeded}/${results.length} posted\n`);
}

run().catch(err => { console.error('Pipeline failed:', err); process.exit(1); });
