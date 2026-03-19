// Blotato API Client — Multi-platform social media publishing
// Publishes to: Instagram, YouTube, TikTok, Facebook, LinkedIn, Threads, X, Pinterest, Bluesky
// API: REST POST to https://api.blotato.com/v1/posts
// Dry-run default: set BLOTATO_API_KEY in .env for live posting
// Cost: $29/mo flat — unlimited posts across all 9 platforms

import { readFileSync } from 'fs';
import { basename } from 'path';

export type BlotatoPlatform =
  | 'instagram' | 'youtube' | 'tiktok' | 'facebook'
  | 'linkedin' | 'threads' | 'x' | 'pinterest' | 'bluesky';

export const ALL_PLATFORMS: BlotatoPlatform[] = [
  'instagram', 'youtube', 'tiktok', 'facebook',
  'linkedin', 'threads', 'x', 'pinterest', 'bluesky',
];

export interface BlotatoPostRequest {
  caption: string;
  mediaUrl: string;            // Public URL or base64-encoded video
  mediaType: 'video' | 'image';
  platforms: BlotatoPlatform[];
  hashtags?: string[];
  scheduledAt?: string;        // ISO datetime for scheduled posting
  title?: string;              // Used by YouTube, LinkedIn
  description?: string;        // Used by YouTube, Pinterest
}

export interface BlotatoPlatformResult {
  platform: BlotatoPlatform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export interface BlotatoPostResponse {
  id: string;
  status: 'published' | 'scheduled' | 'partial' | 'failed';
  platforms: BlotatoPlatformResult[];
  createdAt: string;
}

export class BlotatoClient {
  private apiKey: string | null;
  private baseUrl = 'https://api.blotato.com/v1';
  private dryRun: boolean;

  constructor() {
    this.apiKey = process.env.BLOTATO_API_KEY || null;
    this.dryRun = !this.apiKey;
    if (this.dryRun) {
      console.log('[BlotatoClient] No BLOTATO_API_KEY — running in dry-run mode');
    }
  }

  static isConfigured(): boolean {
    return !!process.env.BLOTATO_API_KEY;
  }

  async post(request: BlotatoPostRequest): Promise<BlotatoPostResponse> {
    if (this.dryRun) {
      return this.mockPost(request);
    }
    return this.livePost(request);
  }

  private async livePost(request: BlotatoPostRequest): Promise<BlotatoPostResponse> {
    const body = {
      content: request.caption,
      media_url: request.mediaUrl,
      media_type: request.mediaType,
      platforms: request.platforms,
      hashtags: request.hashtags || [],
      scheduled_at: request.scheduledAt || null,
      title: request.title || null,
      description: request.description || null,
    };

    const response = await fetch(this.baseUrl + '/posts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Blotato API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;

    return {
      id: data.id || 'blotato-' + Date.now(),
      status: data.status || 'published',
      platforms: (data.platforms || []).map((p: any) => ({
        platform: p.platform,
        success: p.success ?? true,
        postId: p.post_id,
        postUrl: p.post_url,
        error: p.error,
      })),
      createdAt: data.created_at || new Date().toISOString(),
    };
  }

  private mockPost(request: BlotatoPostRequest): BlotatoPostResponse {
    const mockId = 'blotato-dry-' + Date.now();
    console.log(`[BlotatoClient] DRY RUN: Would publish to ${request.platforms.length} platforms`);
    console.log(`[BlotatoClient] Platforms: ${request.platforms.join(', ')}`);
    console.log(`[BlotatoClient] Caption: ${request.caption.substring(0, 80)}...`);
    console.log(`[BlotatoClient] Media: ${request.mediaUrl}`);

    const platformResults: BlotatoPlatformResult[] = request.platforms.map(platform => ({
      platform,
      success: true,
      postId: `dry-${platform}-${Date.now()}`,
      postUrl: this.getMockUrl(platform, mockId),
    }));

    return {
      id: mockId,
      status: 'published',
      platforms: platformResults,
      createdAt: new Date().toISOString(),
    };
  }

  private getMockUrl(platform: BlotatoPlatform, id: string): string {
    const urls: Record<BlotatoPlatform, string> = {
      instagram:  `https://www.instagram.com/reel/${id}`,
      youtube:    `https://youtube.com/shorts/${id}`,
      tiktok:     `https://www.tiktok.com/@kognai/video/${id}`,
      facebook:   `https://www.facebook.com/watch/${id}`,
      linkedin:   `https://www.linkedin.com/posts/${id}`,
      threads:    `https://www.threads.net/@kognai/post/${id}`,
      x:          `https://x.com/kognai/status/${id}`,
      pinterest:  `https://pinterest.com/pin/${id}`,
      bluesky:    `https://bsky.app/profile/kognai/post/${id}`,
    };
    return urls[platform];
  }
}
