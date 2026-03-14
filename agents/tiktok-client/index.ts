// Phase 1 — TikTok Content Agent | Step 4: TikTok Content Posting API v2 Client
// Section 05 Task #6 — Posts archive media to TikTok via PULL_FROM_URL
// API docs: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video

import { TIKTOK_CONFIG } from './config';

export interface TikTokPublishResult {
  publishId: string;
  status: 'success' | 'error';
  error?: string;
}

export interface TikTokPostOptions {
  caption: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  hashtags?: string[];
  privacyLevel?: 'SELF_ONLY' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS';
  dryRun?: boolean;
}

export class TikTokClient {
  private accessToken: string;
  private baseUrl: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken ?? TIKTOK_CONFIG.accessToken;
    this.baseUrl = TIKTOK_CONFIG.baseUrl;
    if (!this.accessToken) {
      console.warn('[TikTokClient] TIKTOK_ACCESS_TOKEN not set — dry-run only');
    }
  }

  async post(options: TikTokPostOptions): Promise<TikTokPublishResult> {
    const fullCaption = this.buildCaption(options.caption, options.hashtags);
    if (options.dryRun || !this.accessToken) {
      console.log(`[DRY-RUN] Would post ${options.mediaType}: ${options.mediaUrl}`);
      console.log(`[DRY-RUN] Caption: ${fullCaption}`);
      return { publishId: `dry-run-${Date.now()}`, status: 'success' };
    }
    return options.mediaType === 'photo'
      ? this.publishPhoto(options, fullCaption)
      : this.publishVideo(options, fullCaption);
  }

  private buildCaption(caption: string, hashtags?: string[]): string {
    const tags = (hashtags ?? []).map(h => `#${h}`).join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }

  private async publishPhoto(options: TikTokPostOptions, fullCaption: string): Promise<TikTokPublishResult> {
    const body = {
      post_info: {
        title: fullCaption,
        privacy_level: options.privacyLevel ?? TIKTOK_CONFIG.defaultPrivacyLevel,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 1,
        photo_images: [options.mediaUrl],
      },
      media_type: 'PHOTO',
    };
    return this.callApi('/post/publish/content/init/', body);
  }

  private async publishVideo(options: TikTokPostOptions, fullCaption: string): Promise<TikTokPublishResult> {
    const body = {
      post_info: {
        title: fullCaption,
        privacy_level: options.privacyLevel ?? TIKTOK_CONFIG.defaultPrivacyLevel,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.mediaUrl,
      },
      media_type: 'VIDEO',
    };
    return this.callApi('/post/publish/video/init/', body);
  }

  private async callApi(path: string, body: object): Promise<TikTokPublishResult> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { data?: { publish_id?: string }; error?: { code: string; message: string } };
      if (!res.ok || json.error?.code !== 'ok') {
        return { publishId: '', status: 'error', error: json.error?.message ?? `HTTP ${res.status}` };
      }
      return { publishId: json.data?.publish_id ?? '', status: 'success' };
    } catch (error) {
      return { publishId: '', status: 'error', error: (error as Error).message };
    }
  }
}
