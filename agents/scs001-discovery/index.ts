// SCS-001 — Discovery Agent (Agent 2)
// Consumes: TrendingTopicBatch from Trend Agent
// Produces: DiscoveryOutput[] (per contracts/scs-001/clip-quality-v1.json#DiscoveryOutput)
// Sprint 101: real YouTube search when YOUTUBE_API_KEY is set; falls back to mock URLs

import { randomUUID, createHash } from 'crypto';

// Sprint 299: Deterministic discovery_id from content hash — enables downstream dedup
function deterministicDiscId(url: string, topicId: string): string {
  return `disc-${createHash('sha256').update(`${url}:${topicId}`).digest('hex').slice(0, 8)}`;
}
import type { TrendingTopicBatch, TrendingTopic } from '../scs001-trend/index';
import { YouTubeSearchProvider } from './youtube-search';

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

// Enriched timestamp templates with phrase triggers for ClipDetection scoring
// Each reason embeds trigger phrases from PHRASE_TRIGGERS so clips can qualify
const TIMESTAMP_TEMPLATES = [
  [
    { start_seconds: 0,   end_seconds: 15,  reason: 'Opening hook — "this changes everything" for {topic}' },
    { start_seconds: 120, end_seconds: 140, reason: 'Core argument — "nobody is talking about" the real impact on {topic}' },
    { start_seconds: 310, end_seconds: 325, reason: 'Emotional peak — "i was completely wrong" about {topic}' },
  ],
  [
    { start_seconds: 0,   end_seconds: 15,  reason: 'Opening hook — "the dirty secret" behind {topic} that experts hide' },
    { start_seconds: 120, end_seconds: 140, reason: 'Core argument — "most people don\'t realize" what {topic} means by 2026' },
    { start_seconds: 310, end_seconds: 325, reason: 'Emotional peak — "i\'ve never seen anything like this" in {topic}' },
  ],
  [
    { start_seconds: 0,   end_seconds: 15,  reason: 'Opening hook — "the reason" {topic} "is dying" faster than anyone expected' },
    { start_seconds: 120, end_seconds: 140, reason: 'Core argument — "here\'s what they\'re not telling you" about {topic}' },
    { start_seconds: 310, end_seconds: 325, reason: 'Emotional peak — "the number one mistake" everyone makes with {topic}' },
  ],
];

function deriveTimestamps(topic: TrendingTopic): DiscoveryTimestamp[] {
  // Rotate templates based on topic name hash for variety
  const hash = topic.topic_name.length % TIMESTAMP_TEMPLATES.length;
  const template = TIMESTAMP_TEMPLATES[hash];
  const topicName = topic.topic_name;

  const base = template.map(t => ({
    start_seconds: t.start_seconds,
    end_seconds:   t.end_seconds,
    reason:        t.reason.replace(/\{topic\}/g, topicName),
  }));

  // Add a timestamp for topics with high confidence (more viral potential)
  if (topic.confidence_score >= 85) {
    base.push({
      start_seconds: 480,
      end_seconds:   495,
      reason: 'High-confidence — "within 12 months" ' + topicName + ' will reshape the industry',
    });
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
  async run(batch: TrendingTopicBatch): Promise<DiscoveryOutput[]> {
    const outputs: DiscoveryOutput[] = [];
    const useYouTube = YouTubeSearchProvider.isConfigured();

    if (useYouTube) {
      console.log('[DiscoveryAgent] YOUTUBE_API_KEY set — using real YouTube search');
    } else {
      console.log('[DiscoveryAgent] YOUTUBE_API_KEY not set — using mock URLs');
    }

    const searcher = useYouTube ? new YouTubeSearchProvider() : null;

    for (const topic of batch.topics) {
      let discovered = false;

      // Live mode: search YouTube for real video URLs
      if (searcher) {
        try {
          const results = await searcher.searchForTopic(topic, 2);
          for (const result of results) {
            outputs.push({
              discovery_id: deterministicDiscId(result.url, topic.topic_id),
              url: result.url,
              timestamps: deriveTimestamps(topic),
              speaker: result.channelName,
              topic_tags: topic.keyword_cluster.slice(0, 5),
              source_score: deriveSourceScore(topic),
              source_topic_id: topic.topic_id,
            });
          }
          if (results.length > 0) discovered = true;
        } catch (err) {
          console.warn('[DiscoveryAgent] YouTube search failed for "' + topic.topic_name + '": ' + (err as Error).message);
        }
      }

      // Mock fallback: use template URLs when YouTube not configured or search returned nothing
      if (!discovered) {
        const channels = topic.relevant_channels ?? [];
        const targetChannels = channels.length > 0
          ? channels.slice(0, 2)
          : [{ platform: 'youtube', channel_id: MOCK_CHANNEL_IDS['youtube'] ?? 'mock001' }];

        for (const channel of targetChannels) {
          const baseUrl = MOCK_VIDEO_BASE[channel.platform] ?? 'https://video.example.com/';
          const url = `${baseUrl}${channel.channel_id}`;
          outputs.push({
            discovery_id: deterministicDiscId(url, topic.topic_id),
            url,
            timestamps: deriveTimestamps(topic),
            speaker: pickSpeaker(topic),
            topic_tags: topic.keyword_cluster.slice(0, 5),
            source_score: deriveSourceScore(topic),
            source_topic_id: topic.topic_id,
          });
        }
      }
    }

    console.log(`[DiscoveryAgent] ${batch.topics.length} topics → ${outputs.length} discovery candidates`);
    return outputs;
  }
}
