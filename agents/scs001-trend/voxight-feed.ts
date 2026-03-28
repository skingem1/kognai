// Voxight Feed Provider — Block B-01 (VOXIGHT-BLOCK-B-01)
// Queries real IntelligenceSignals from Voxight's Supabase table.
// Converts to Oracle6Feed format for SCS-001 TrendAgent consumption.
// Both Kognai and Voxight share the same Supabase project.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Load Kognai env
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

// Same Supabase as Voxight (shared project)
const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://hroblewzdsosomytdvwe.supabase.co',
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''
);

const SIGNAL_LOOKBACK_DAYS = 7;
const MIN_CONFIDENCE = 60;

interface Oracle6Signal {
  signal_id: string;
  topic: string;
  confidence: number;
  scs_relevant: boolean;
  domain_tag: string;
  keyword_cluster?: string[];
  mainstream_eta_days?: number;
  provenance_source?: string;
}

interface Oracle6Feed {
  feed_id: string;
  generated_at: string;
  feed_status: 'mock' | 'live' | 'degraded';
  signals: Oracle6Signal[];
}

// Map Voxight domain labels to Oracle6 domain_tag values
function mapDomain(domain: string | null): string {
  const map: Record<string, string> = {
    'AI':            'AI',
    'Web3':          'Web3',
    'fintech':       'fintech',
    'regulation':    'regulation',
    'agent_economy': 'AI',
  };
  return map[domain ?? ''] ?? 'AI';
}

// Map Voxight signal_type to a human-readable provenance tag
function mapProvenance(signalType: string): string {
  const map: Record<string, string> = {
    spaces_insight:           'voxight_spaces',
    hashtag_emergence:        'voxight_hashtags',
    thought_leader_alert:     'voxight_thought_leaders',
    narrative_shift:          'voxight_narratives',
    cross_signal_correlation: 'voxight_correlation',
  };
  return map[signalType] ?? 'voxight';
}

export class VoxightFeedProvider {
  async fetch(): Promise<Oracle6Feed> {
    try {
      const since = new Date(
        Date.now() - SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase
        .from('signals')
        .select('id, domain, signal_type, topic, summary, confidence_score, scs_relevance, tags')
        .gte('signal_timestamp', since)
        .gte('confidence_score', MIN_CONFIDENCE)
        .order('confidence_score', { ascending: false })
        .limit(50);

      if (error) throw new Error(`Supabase error: ${error.message}`);

      if (!data || data.length === 0) {
        console.warn('[VoxightFeed] No signals found — returning empty live feed');
        return {
          feed_id:      randomUUID(),
          generated_at: new Date().toISOString(),
          feed_status:  'degraded',
          signals:      [],
        };
      }

      const signals: Oracle6Signal[] = data.map((row: any) => ({
        signal_id:          `oracle6-${row.id}`,
        topic:              (row.topic ?? '').slice(0, 120),
        confidence:         Math.min(99, Math.max(0, row.confidence_score ?? 0)),
        scs_relevant:       true,   // All Voxight signals target AI/Web3/fintech by design
        domain_tag:         mapDomain(row.domain),
        keyword_cluster:    Array.isArray(row.tags) ? row.tags.slice(0, 8) : [],
        provenance_source:  mapProvenance(row.signal_type),
        mainstream_eta_days: 14,
      }));

      console.log(`[VoxightFeed] Loaded ${signals.length} real signals from Supabase`);
      return {
        feed_id:      randomUUID(),
        generated_at: new Date().toISOString(),
        feed_status:  'live',
        signals,
      };
    } catch (err: any) {
      console.error(`[VoxightFeed] Failed: ${err.message} — returning degraded feed`);
      return {
        feed_id:      randomUUID(),
        generated_at: new Date().toISOString(),
        feed_status:  'degraded',
        signals:      [],
      };
    }
  }
}
