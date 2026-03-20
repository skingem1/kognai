/**
 * brand-mention-scan.ts — GEO brand mention delta tracker
 *
 * Scans for Kognai entity mentions across web sources and updates
 * workspace/geo/brand-baseline.json with new counts.
 *
 * Usage: npx tsx scripts/geo/brand-mention-scan.ts
 * Schedule: Weekly via PM2 cron
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const BASELINE_PATH = path.join(__dirname, '../../workspace/geo/brand-baseline.json');

interface EntityTracking {
  entity: string;
  type: string;
  baseline_mentions: number;
  current_mentions?: number;
  delta?: number;
  notes: string;
}

interface BrandBaseline {
  _note: string;
  scan_date: string;
  status: string;
  entities_tracked: EntityTracking[];
  ai_engines_checked: Array<{
    engine: string;
    query: string;
    result: string;
    date: string;
  }>;
  next_scan_due: string;
  scan_history?: Array<{
    date: string;
    total_mentions: number;
    entities: Record<string, number>;
  }>;
}

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'KognaiGEOBot/1.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => data += chunk.toString());
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function countMentions(entity: string): Promise<number> {
  // Search via DuckDuckGo HTML (no API key needed)
  const query = encodeURIComponent(`"${entity}" AI`);
  try {
    const html = await fetchPage(`https://html.duckduckgo.com/html/?q=${query}`);
    // Count result snippets containing the entity
    const regex = new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = html.match(regex);
    return matches ? matches.length : 0;
  } catch (err) {
    console.error(`  [WARN] Failed to scan for "${entity}": ${(err as Error).message}`);
    return -1; // -1 = scan failed
  }
}

async function main() {
  console.log('=== Kognai GEO Brand Mention Scanner ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log();

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('ERROR: brand-baseline.json not found. Run Sprint 464 first.');
    process.exit(1);
  }

  const baseline: BrandBaseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
  const scanDate = new Date().toISOString().split('T')[0];
  const scanResults: Record<string, number> = {};
  let totalMentions = 0;

  for (const entity of baseline.entities_tracked) {
    console.log(`Scanning: "${entity.entity}" (${entity.type})...`);
    const count = await countMentions(entity.entity);
    entity.current_mentions = count >= 0 ? count : entity.baseline_mentions;
    entity.delta = entity.current_mentions - entity.baseline_mentions;
    scanResults[entity.entity] = entity.current_mentions;
    totalMentions += Math.max(0, entity.current_mentions);
    console.log(`  Found: ${count >= 0 ? count : 'SCAN_FAILED'} mentions (delta: ${entity.delta >= 0 ? '+' : ''}${entity.delta})`);
  }

  // Update scan metadata
  baseline.scan_date = new Date().toISOString();
  baseline.status = 'scanned';
  baseline.next_scan_due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Append to scan history
  if (!baseline.scan_history) baseline.scan_history = [];
  baseline.scan_history.push({
    date: scanDate,
    total_mentions: totalMentions,
    entities: scanResults,
  });

  // Keep only last 12 weeks of history
  if (baseline.scan_history.length > 12) {
    baseline.scan_history = baseline.scan_history.slice(-12);
  }

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

  console.log();
  console.log(`Total mentions: ${totalMentions}`);
  console.log(`Baseline updated: ${BASELINE_PATH}`);
  console.log(`Next scan due: ${baseline.next_scan_due}`);

  // Alert if significant delta detected
  const significantDeltas = baseline.entities_tracked.filter(e => Math.abs(e.delta || 0) > 5);
  if (significantDeltas.length > 0) {
    console.log();
    console.log('⚠ SIGNIFICANT DELTAS DETECTED:');
    for (const e of significantDeltas) {
      console.log(`  ${e.entity}: ${e.delta! >= 0 ? '+' : ''}${e.delta} mentions`);
    }
  }
}

main().catch(console.error);
