// SCS-001 — YouTube Search Provider (Sprint 101)
// Searches YouTube for real videos matching trending topics.
// Used by DiscoveryAgent when YOUTUBE_API_KEY is set.
//
// API: YouTube Data API v3 search endpoint (100 units/request, 10k/day free)
// No npm dependencies — uses native fetch()

import type { TrendingTopic } from '../scs001-trend/index';

export interface YouTubeSearchResult {
  url:          string;  // https://www.youtube.com/watch?v={videoId}
  channelName:  string;
  videoTitle:   string;
  duration:     string;  // template: '30m' (real duration requires extra API call)
}

export class YouTubeSearchProvider {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.YOUTUBE_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('[YouTubeSearchProvider] YOUTUBE_API_KEY not set');
    }
  }

  async searchForTopic(topic: TrendingTopic, maxResults = 3): Promise<YouTubeSearchResult[]> {
    // Build search query from topic + keywords
    const q = encodeURIComponent(topic.topic_name + ' explained analysis');
    const url = 'https://www.googleapis.com/youtube/v3/search' +
      '?q=' + q +
      '&type=video' +
      '&order=relevance' +
      '&videoCategoryId=28' +
      '&maxResults=' + maxResults +
      '&part=snippet' +
      '&key=' + this.apiKey;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn('[YouTubeSearchProvider] Search API returned ' + response.status + ' for topic: ' + topic.topic_name);
        return [];
      }

      const data = await response.json() as {
        items: Array<{
          id: { videoId: string };
          snippet: { title: string; channelTitle: string };
        }>;
      };

      return (data.items ?? []).map(item => ({
        url:         'https://www.youtube.com/watch?v=' + item.id.videoId,
        channelName: item.snippet.channelTitle,
        videoTitle:  item.snippet.title,
        duration:    '30m', // template — real duration requires videos.list API call (extra quota)
      }));
    } catch (err) {
      console.warn('[YouTubeSearchProvider] Search failed for "' + topic.topic_name + '": ' + (err as Error).message);
      return [];
    }
  }

  // Returns true if the API key is configured in the environment
  static isConfigured(): boolean {
    return !!(process.env.YOUTUBE_API_KEY);
  }
}
