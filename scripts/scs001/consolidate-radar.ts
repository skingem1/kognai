#!/usr/bin/env ts-node
/**
 * consolidate-radar.ts — Merge topic radar outputs into viral-topics.json
 *
 * Reads all radar-*.json files from topic-radar/, deduplicates against
 * seen-topics.json, and writes an enriched viral-topics.json with actual
 * trending topic titles, sources, and confidence scores (not just keywords).
 *
 * Run: npx ts-node scripts/scs001/consolidate-radar.ts
 * PM2: can be added as post-radar cron
 *
 * Sprint 663
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const RADAR_DIR = join(ROOT, 'workspace', 'scs001', 'topic-radar');
const VIRAL_PATH = join(ROOT, 'workspace', 'scs001', 'viral-topics.json');

interface RadarTopic {
  topic_id: string;
  title: string;
  summary: string;
  format: string;
  source: string;
  source_url: string;
  confidence: number;
  keywords: string[];
  collected_at: string;
}

interface RadarFile {
  radar_id: string;
  collected_at: string;
  topics: RadarTopic[];
}

interface EnrichedViralTopics {
  topics: string[];                // legacy: keyword list for backward compat
  trending: TrendingTopic[];       // new: rich topic data from radar
  updated_at: string;
  source: string;
}

interface TrendingTopic {
  title: string;
  source: string;
  source_url: string;
  confidence: number;
  format: string;
  collected_at: string;
}

function loadRadarFiles(): RadarFile[] {
  if (!existsSync(RADAR_DIR)) return [];
  const files = readdirSync(RADAR_DIR)
    .filter(f => f.startsWith('radar-') && f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  // Only process last 24h of radar files (max 20 files)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent: RadarFile[] = [];

  for (const f of files.slice(0, 20)) {
    try {
      const data = JSON.parse(readFileSync(join(RADAR_DIR, f), 'utf-8')) as RadarFile;
      if (data.collected_at >= cutoff) recent.push(data);
    } catch { /* skip corrupt */ }
  }
  return recent;
}

function loadSeenTopics(): Set<string> {
  const seenPath = join(RADAR_DIR, 'seen-topics.json');
  if (!existsSync(seenPath)) return new Set();
  try {
    const arr = JSON.parse(readFileSync(seenPath, 'utf-8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function consolidate(): void {
  const radars = loadRadarFiles();
  if (radars.length === 0) {
    console.log('[consolidate-radar] No recent radar files found');
    return;
  }

  const seen = loadSeenTopics();

  // Collect all topics, dedupe by topic_id, sort by confidence desc
  const topicMap = new Map<string, RadarTopic>();
  for (const radar of radars) {
    for (const t of radar.topics) {
      if (!topicMap.has(t.topic_id) || t.confidence > (topicMap.get(t.topic_id)!.confidence)) {
        topicMap.set(t.topic_id, t);
      }
    }
  }

  // Filter out already-seen, sort by confidence
  const fresh = Array.from(topicMap.values())
    .filter(t => !seen.has(t.topic_id))
    .sort((a, b) => b.confidence - a.confidence);

  // Take top 10 trending topics
  const top = fresh.slice(0, 10);

  // Build enriched output
  const trending: TrendingTopic[] = top.map(t => ({
    title: t.title.length > 80 ? t.title.slice(0, 77) + '...' : t.title,
    source: t.source,
    source_url: t.source_url,
    confidence: t.confidence,
    format: t.format,
    collected_at: t.collected_at,
  }));

  // Legacy keywords from top topics
  const keywords = new Set<string>();
  for (const t of top) {
    for (const kw of t.keywords.slice(0, 3)) {
      keywords.add(kw.toLowerCase());
    }
  }

  const output: EnrichedViralTopics = {
    topics: Array.from(keywords).slice(0, 10),
    trending,
    updated_at: new Date().toISOString(),
    source: 'topic-radar-consolidation',
  };

  writeFileSync(VIRAL_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`[consolidate-radar] Wrote ${trending.length} trending topics to viral-topics.json`);
  console.log(`[consolidate-radar] Top: ${top.slice(0, 3).map(t => t.title).join(' | ')}`);
}

consolidate();
