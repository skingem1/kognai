// SCS-001 — Discovery Agent (Agent 2)
// Consumes: TrendingTopicBatch from Trend Agent
// Produces: DiscoveryOutput[] (per contracts/scs-001/clip-quality-v1.json#DiscoveryOutput)
// Block A: operates on mock data (no real YouTube/X API calls)

import { randomUUID } from 'crypto';
import type { TrendingTopicBatch, TrendingTopic } from '../scs001-trend/index';

export interface DiscoveryTimestamp {
  start_seconds: number;
  end_seconds: number;
  reason: string;
}

export interface DiscoveryOutput {
  discovery_id: string;
  url: string;
  timestamps: DiscoveryTimestamp[];
  speaker: string;
  topic_tags: string[];
  source_score: number;
  source_topic_id: string;
}

// Mock video sources per platform when no real API is available
const MOCK_VIDEO_BASE: Record<string, string> = {
  youtube:    'https://www.youtube.com/watch?v=',
  x_spaces:   'https://twitter.com/i/spaces/',
  podcast:    'https://podcasts.example.com/episode/',
  reddit:     'https://www.reddit.com/r/MachineLearning/comments/',
  hacker_news:'https://news.ycombinator.com/item?id=',
};

const MOCK_CHANNEL_IDS: Record<string, string> = {
  youtube:    'dQw4w9WgXcQ', // placeholder
  x_spaces:   '1vOGwrBwAQkxB',
  podcast:    'ep-001',
  reddit:     'abc123',
  hacker_news:'38000001',
};

// Simulated clip-worthy moment templates based on topic characteristics
function deriveTimestamps(topic: TrendingTopic): DiscoveryTimestamp[] {
  const base = [
    { start_seconds: 0,   end_seconds: 15,  reason: 'Opening hook — bold claim or prediction' },
    { start_seconds: 120, end_seconds: 140, reason: 'Core argument — specific data point or paradigm shift statement' },
    { start_seconds: 310, end_seconds: 325, reason: 'Emotional peak — speaker conviction or contrarian stance' },
  ];
  // Add a timestamp for topics with high confidence (more viral potential)
  if (topic.confidence_score >= 85) {
    base.push({ start_seconds: 480, end_seconds: 495, reason: 'High-confidence topic — closing prediction or call to action' });
  }
  return base;
}

function deriveSourceScore(topic: TrendingTopic): number {
  // Score based on topic confidence and provenance
  if (topic.confidence_score >= 90) return 5;
  if (topic.confidence_score >= 80) return 4;
  if (topic.confidence_score >= 70) return 3;
  return 2;
}

function pickSpeaker(topic: TrendingTopic): string {
  if (topic.top_speakers && topic.top_speakers.length > 0) {
    return topic.top_speakers[0].name;
  }
  return 'Unknown Speaker';
}

export class DiscoveryAgent {
  run(batch: TrendingTopicBatch): DiscoveryOutput[] {
    const outputs: DiscoveryOutput[] = [];

    for (const topic of batch.topics) {
      const channels = topic.relevant_channels ?? [];
      const targetChannels = channels.length > 0
        ? channels.slice(0, 2)  // max 2 channels per topic in Block A
        : [{ platform: 'youtube', channel_id: MOCK_CHANNEL_IDS['youtube'] ?? 'mock001' }];

      for (const channel of targetChannels) {
        const baseUrl = MOCK_VIDEO_BASE[channel.platform] ?? 'https://video.example.com/';
        const url = `${baseUrl}${channel.channel_id}`;

        const output: DiscoveryOutput = {
          discovery_id: `disc-${randomUUID().slice(0, 8)}`,
          url,
          timestamps: deriveTimestamps(topic),
          speaker: pickSpeaker(topic),
          topic_tags: topic.keyword_cluster.slice(0, 5),
          source_score: deriveSourceScore(topic),
          source_topic_id: topic.topic_id,
        };
        outputs.push(output);
      }
    }

    console.log(`[DiscoveryAgent] ${batch.topics.length} topics → ${outputs.length} discovery candidates`);
    return outputs;
  }
}
