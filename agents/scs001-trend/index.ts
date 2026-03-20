// SCS-001 — Trend Agent (Agent 1)
// Consumes: ORACLE-6 intelligence signals (mock or live)
// Produces: TrendingTopicBatch (per contracts/scs-001/trending-topic-v1.json)
// Sprint 101: added live mode via LiveFeedProvider (Google Trends + YouTube Trending)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { LiveFeedProvider } from './live-feed';
import { getCompetitorTopics } from './competitor-feed';

interface Oracle6Signal {
  signal_id: string;
  topic: string;
  confidence: number;
  scs_relevant: boolean;
  domain_tag: string;
  keyword_cluster?: string[];
  top_speakers?: Array<{ name: string; handle?: string; authority_score?: number }>;
  relevant_channels?: Array<{ platform: string; channel_id: string; channel_name?: string }>;
  mainstream_eta_days?: number;
  provenance_source?: string;
}

interface Oracle6Feed {
  feed_id: string;
  generated_at: string;
  feed_status: 'mock' | 'live' | 'degraded';
  signals: Oracle6Signal[];
}

export interface TrendingTopic {
  topic_id: string;
  topic_name: string;
  confidence_score: number;
  keyword_cluster: string[];
  top_speakers?: Array<{ name: string; handle?: string; authority_score?: number }>;
  relevant_channels?: Array<{ platform: string; channel_id: string; channel_name?: string }>;
  domain_tags: string[];
  provenance_source?: string;
  mainstream_eta_days?: number;
}

export interface TrendingTopicBatch {
  batch_id: string;
  generated_at: string;
  oracle6_feed_status: 'mock' | 'live' | 'degraded';
  topics: TrendingTopic[];
}

const CONFIDENCE_GATE = 60;
const ROOT = join(__dirname, '..', '..');
const MOCK_FEED_PATH = join(ROOT, 'contracts', 'scs-001', 'mock-oracle6-feed.json');

export class TrendAgent {
  private feedPath: string;
  private mode: 'mock' | 'live';

  constructor(feedPath?: string, mode?: 'mock' | 'live') {
    this.feedPath = feedPath ?? MOCK_FEED_PATH;
    this.mode = mode ?? (process.env.SCS_MODE === 'live' ? 'live' : 'mock');
  }

  async run(seq = 1, priority_topics: string[] = []): Promise<TrendingTopicBatch> {
    const feed = await this.loadFeed();

    // Sprint 479: Merge competitor-sourced topics into priority list
    const competitorTopics = getCompetitorTopics();
    const allPriority = [...priority_topics, ...competitorTopics];
    if (competitorTopics.length > 0) {
      console.log(`[TrendAgent] Competitor feed injected ${competitorTopics.length} topic(s)`);
    }

    // Apply viral-topic confidence boost (+15, capped at 99) before gating
    const BOOST = 15;
    let boostedCount = 0;
    if (allPriority.length > 0) {
      const priorityLower = allPriority.map(t => t.toLowerCase());
      for (const s of feed.signals) {
        const topicLower = s.topic.toLowerCase();
        if (priorityLower.some(p => topicLower.includes(p) || p.includes(topicLower))) {
          s.confidence = Math.min(99, s.confidence + BOOST);
          boostedCount++;
        }
      }
      if (boostedCount > 0) {
        console.log(`[TrendAgent] Boosted ${boostedCount} viral topic(s) by +${BOOST} confidence`);
      }
    }

    // Sprint 500: If live feed has 0 SCS-relevant topics, inject competitor topics
    // as synthetic signals so the pipeline always has content to produce.
    const scsRelevantCount = feed.signals.filter(s => s.scs_relevant === true).length;
    if (scsRelevantCount === 0 && competitorTopics.length > 0) {
      console.log(`[TrendAgent] Live feed has 0 SCS-relevant topics — injecting ${competitorTopics.length} competitor topics as signals`);
      for (let i = 0; i < competitorTopics.length; i++) {
        feed.signals.push({
          signal_id: 'comp-' + randomUUID().slice(0, 8),
          topic: competitorTopics[i],
          confidence: 75 - i,  // 75, 74, 73... (all above gate=60)
          scs_relevant: true,
          domain_tag: 'competitor_feed',
          keyword_cluster: competitorTopics[i].toLowerCase().split(/\s+/).filter(w => w.length > 2),
          provenance_source: 'competitor_feed',
          mainstream_eta_days: 7,
        });
      }
    }

    const qualified = feed.signals
      .filter(s => s.scs_relevant === true && s.confidence >= CONFIDENCE_GATE);

    // Sprint 518: Weighted random shuffle — confidence as weight, not strict sort.
    // This ensures each run produces a different topic mix from the pool.
    const shuffled = this.weightedShuffle(qualified);

    const topics: TrendingTopic[] = shuffled.map(s => ({
      topic_id: s.signal_id,
      topic_name: s.topic,
      confidence_score: s.confidence,
      keyword_cluster: s.keyword_cluster ?? this.deriveKeywords(s.topic),
      top_speakers: s.top_speakers,
      relevant_channels: s.relevant_channels,
      domain_tags: [s.domain_tag],
      provenance_source: (s.provenance_source as TrendingTopic['provenance_source']) ?? 'manual_seed',
      mainstream_eta_days: s.mainstream_eta_days,
    }));

    const batch: TrendingTopicBatch = {
      batch_id: `trend-batch-${new Date().toISOString().slice(0, 10)}-${String(seq).padStart(3, '0')}`,
      generated_at: new Date().toISOString(),
      oracle6_feed_status: feed.feed_status ?? 'mock',
      topics,
    };

    console.log(`[TrendAgent] Processed ${feed.signals.length} signals → ${topics.length} qualified (gate: ${CONFIDENCE_GATE})`);
    return batch;
  }

  private async loadFeed(): Promise<Oracle6Feed> {
    if (this.mode === 'live') {
      console.log('[TrendAgent] Mode: live — fetching real trending data');
      const provider = new LiveFeedProvider();
      return provider.fetch();
    }
    console.log('[TrendAgent] Mode: mock — reading static feed');
    const raw = readFileSync(this.feedPath, 'utf8');
    return JSON.parse(raw) as Oracle6Feed;
  }

  /** Sprint 518: Weighted random shuffle — higher confidence = more likely to appear first,
   *  but not deterministic. Uses confidence as weight for random sampling. */
  private weightedShuffle(items: Oracle6Signal[]): Oracle6Signal[] {
    const pool = [...items];
    const result: Oracle6Signal[] = [];
    while (pool.length > 0) {
      const totalWeight = pool.reduce((sum, s) => sum + s.confidence, 0);
      let r = Math.random() * totalWeight;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].confidence;
        if (r <= 0) { idx = i; break; }
      }
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  private deriveKeywords(topic: string): string[] {
    return topic
      .toLowerCase()
      .split(/[\s,\-–—]+/)
      .filter(w => w.length > 3)
      .slice(0, 5);
  }
}

export function saveBatch(batch: TrendingTopicBatch, outDir: string): string {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${batch.batch_id}.json`);
  writeFileSync(outPath, JSON.stringify(batch, null, 2));
  return outPath;
}

if (require.main === module) {
  (async () => {
    const agent = new TrendAgent();
    const batch = await agent.run();
    const outDir = join(ROOT, 'workspace', 'scs001', 'trend-outputs');
    const outPath = saveBatch(batch, outDir);
    console.log(`[TrendAgent] Batch saved → ${outPath}`);
    console.log(JSON.stringify(batch, null, 2));
  })().catch(err => { console.error(err); process.exit(1); });
}
