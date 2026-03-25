/**
 * curator-trading.ts — AMD-25 Trading Knowledge Curator
 *
 * Reads topic-radar JSON files, filters for finance/trading signals,
 * stores matching records to workspace/knowledge/trading/records/.
 *
 * Run: npx tsx scripts/agents/curator-trading.ts
 * PM2: daily cron via ecosystem.config.js
 * Model: T1 qwen3:4b (no LLM calls — pure filtering)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = join(import.meta.dirname ?? __dirname, '..', '..');
const RADAR_DIR = join(PROJECT_ROOT, 'workspace', 'scs001', 'topic-radar');
const RECORDS_DIR = join(PROJECT_ROOT, 'workspace', 'knowledge', 'trading', 'records');
const SCHEMA_PATH = join(PROJECT_ROOT, 'workspace', 'knowledge', 'trading', 'schema.json');
const SEEN_PATH = join(RECORDS_DIR, '.seen-ids.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadarTopic {
  topic_id: string;
  title: string;
  summary: string;
  format: string;
  source: string;
  source_url?: string;
  confidence: number;
  keywords: string[];
  collected_at: string;
}

interface RadarFile {
  radar_id: string;
  collected_at: string;
  topics: RadarTopic[];
}

interface TradingRecord {
  id: string;
  timestamp: string;
  asset_class: string;
  timeframe: string;
  strategy_type: string;
  source: string;
  source_url: string;
  title: string;
  summary: string;
  keywords: string[];
  confidence: number;
  price_change_pct: number | null;
  curated_by: string;
}

// ---------------------------------------------------------------------------
// Finance keyword filter
// ---------------------------------------------------------------------------

const FINANCE_KEYWORDS = [
  'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'defi', 'trading',
  'market', 'price', 'stock', 'forex', 'commodity', 'gold', 'silver',
  'nft', 'token', 'coin', 'blockchain', 'yield', 'apy', 'staking',
  'liquidity', 'swap', 'exchange', 'bull', 'bear', 'rally', 'correction',
  'hedge', 'portfolio', 'investment', 'futures', 'options', 'leverage',
  'coingecko', 'coinmarketcap', 'binance', 'uniswap'
];

function isFinanceSignal(topic: RadarTopic): boolean {
  const text = `${topic.title} ${topic.summary} ${topic.keywords.join(' ')}`.toLowerCase();
  return FINANCE_KEYWORDS.some(kw => text.includes(kw));
}

// ---------------------------------------------------------------------------
// Asset class detection
// ---------------------------------------------------------------------------

function detectAssetClass(topic: RadarTopic): string {
  const text = `${topic.title} ${topic.summary} ${topic.keywords.join(' ')}`.toLowerCase();
  if (text.includes('defi') || text.includes('yield') || text.includes('apy') || text.includes('staking')) return 'defi';
  if (text.includes('nft')) return 'nft';
  if (text.includes('gold') || text.includes('silver') || text.includes('oil')) return 'commodities';
  if (text.includes('forex') || text.includes('usd') || text.includes('eur')) return 'forex';
  if (text.includes('stock') || text.includes('nasdaq') || text.includes('s&p')) return 'equities';
  if (text.includes('macro') || text.includes('fed') || text.includes('inflation')) return 'macro';
  return 'crypto'; // default for coingecko-sourced data
}

// ---------------------------------------------------------------------------
// Price change extraction
// ---------------------------------------------------------------------------

function extractPriceChange(title: string): number | null {
  const match = title.match(/([+-]?\d+\.?\d*)%/);
  return match ? parseFloat(match[1]) : null;
}

function detectStrategyType(topic: RadarTopic): string {
  const pct = extractPriceChange(topic.title);
  if (pct !== null && Math.abs(pct) > 10) return 'momentum';
  if (topic.source === 'coingecko') return 'trend-following';
  return 'sentiment';
}

// ---------------------------------------------------------------------------
// Main curator logic
// ---------------------------------------------------------------------------

function loadSeenIds(): Set<string> {
  if (!existsSync(SEEN_PATH)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(SEEN_PATH, 'utf-8')));
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  writeFileSync(SEEN_PATH, JSON.stringify([...ids].slice(-10000))); // keep last 10k
}

function run(): void {
  console.log(`[curator-trading] Starting — ${new Date().toISOString()}`);

  if (!existsSync(RECORDS_DIR)) mkdirSync(RECORDS_DIR, { recursive: true });

  // Load schema to verify it exists
  if (!existsSync(SCHEMA_PATH)) {
    console.error('[curator-trading] ERROR: schema.json not found');
    process.exit(1);
  }

  const seenIds = loadSeenIds();
  const radarFiles = readdirSync(RADAR_DIR).filter(f => f.startsWith('radar-') && f.endsWith('.json'));

  console.log(`[curator-trading] Found ${radarFiles.length} radar files`);

  let ingested = 0;
  let skipped = 0;
  let filtered = 0;
  const newRecords: TradingRecord[] = [];

  for (const file of radarFiles) {
    try {
      const raw = readFileSync(join(RADAR_DIR, file), 'utf-8');
      const radar: RadarFile = JSON.parse(raw);

      for (const topic of radar.topics) {
        if (seenIds.has(topic.topic_id)) {
          skipped++;
          continue;
        }

        seenIds.add(topic.topic_id);

        if (!isFinanceSignal(topic)) {
          filtered++;
          continue;
        }

        const record: TradingRecord = {
          id: topic.topic_id,
          timestamp: topic.collected_at,
          asset_class: detectAssetClass(topic),
          timeframe: 'daily',
          strategy_type: detectStrategyType(topic),
          source: topic.source,
          source_url: topic.source_url ?? '',
          title: topic.title,
          summary: topic.summary,
          keywords: topic.keywords,
          confidence: topic.confidence,
          price_change_pct: extractPriceChange(topic.title),
          curated_by: 'curator-trading',
        };

        newRecords.push(record);
        ingested++;
      }
    } catch (e) {
      console.warn(`[curator-trading] WARN: Failed to parse ${file}: ${(e as Error).message}`);
    }
  }

  // Write new records as a batch file
  if (newRecords.length > 0) {
    const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const outPath = join(RECORDS_DIR, `${batchId}.json`);
    writeFileSync(outPath, JSON.stringify({ batch_id: batchId, count: newRecords.length, records: newRecords }, null, 2));
    console.log(`[curator-trading] Wrote ${newRecords.length} records → ${batchId}.json`);
  }

  saveSeenIds(seenIds);

  console.log(`[curator-trading] Done — ingested: ${ingested}, filtered: ${filtered}, skipped (seen): ${skipped}`);
}

run();
