// SCS-001 — Publishing Agent (Agent 8 — Distribution Layer)
// Consumes: QualityControlGate[] (passed only) + CaptionedVideo[] + ScriptBundle[]
// Produces: PublishedVideo[] (per contracts/scs-001/publishing-analytics-v1.json)
// Engine: Blotato API (9 platforms) with TikTok-only fallback
// Sprint 253: Multi-platform via Blotato ($29/mo). Dry-run default.

import { randomUUID } from 'crypto';
import type { QualityControlGate } from '../scs001-qc/index';
import type { CaptionedVideo } from '../scs001-caption/index';
import type { ScriptBundle } from '../scs001-script/index';
import { TikTokClient, TikTokPostOptions } from '../tiktok-client/index';
import { VideoHostingService } from '../scs001-hosting/index';
import { BlotatoClient, BlotatoPostRequest, BlotatoPlatformResult, ALL_PLATFORMS } from '../../scripts/scs001/blotato-client';
import type { BlotatoPlatform } from '../../scripts/scs001/blotato-client';

export interface PublishedVideo {
  publish_id:           string;
  video_id:             string;
  platform:             string;  // Now supports all 9 Blotato platforms
  post_url:             string;
  posted_at:            string;
  posting_slot:         'morning_0700_0900' | 'midday_1200_1300' | 'evening_1800_2000' | 'late_night_2100_2300';
  scheduled_post_time:  string;
  caption_text:         string;
  hashtags:             string[];
  publish_method:       'blotato' | 'tiktok-direct' | 'browser-use';  // Which path was used
  platform_results?:    BlotatoPlatformResult[];       // Per-platform status from Blotato
}

// Prime-time slots in order — round-robin assignment per video index
const POSTING_SLOTS: Array<{ slot: PublishedVideo['posting_slot']; hour: number; minute: number }> = [
  { slot: 'morning_0700_0900',   hour: 7,  minute: 0 },
  { slot: 'midday_1200_1300',    hour: 12, minute: 0 },
  { slot: 'evening_1800_2000',   hour: 18, minute: 0 },
  { slot: 'late_night_2100_2300', hour: 21, minute: 0 },
];

function assignPostingSlot(index: number): { slot: PublishedVideo['posting_slot']; scheduled_post_time: string } {
  const entry = POSTING_SLOTS[index % POSTING_SLOTS.length];
  const today = new Date();
  const scheduled = new Date(today.getFullYear(), today.getMonth(), today.getDate(), entry.hour, entry.minute, 0);
  return { slot: entry.slot, scheduled_post_time: scheduled.toISOString() };
}

// Topic-aware hashtag bank — 50 tags across 5 clusters
const HASHTAG_BANK: Record<string, string[]> = {
  ai:       ['ai', 'aitools', 'artificialintelligence', 'chatgpt', 'machinelearning', 'llm', 'openai', 'claude', 'deeplearning', 'aitech'],
  tech:     ['tech', 'technology', 'coding', 'software', 'startup', 'programming', 'developer', 'innovation', 'futuretech', 'techtrends'],
  business: ['business', 'entrepreneur', 'startup', 'founder', 'investing', 'venturecapital', 'productlaunch', 'growth', 'saas', 'funding'],
  science:  ['science', 'quantum', 'robotics', 'biotech', 'research', 'physics', 'spacetech', 'climatetech', 'neuroscience', 'genomics'],
  viral:    ['learnontiktok', 'didyouknow', 'mindblown', 'fyp', 'foryou', 'viral', 'trending', 'knowledge', 'explainer', 'deepdive'],
};

// Keyword → cluster mapping for topic detection
const TOPIC_KEYWORDS: Record<string, keyof typeof HASHTAG_BANK> = {
  'ai': 'ai', 'gpt': 'ai', 'llm': 'ai', 'model': 'ai', 'neural': 'ai', 'openai': 'ai',
  'claude': 'ai', 'chatgpt': 'ai', 'deepseek': 'ai', 'gemini': 'ai', 'anthropic': 'ai',
  'code': 'tech', 'software': 'tech', 'app': 'tech', 'developer': 'tech', 'programming': 'tech',
  'startup': 'business', 'fund': 'business', 'invest': 'business', 'revenue': 'business', 'saas': 'business',
  'quantum': 'science', 'robot': 'science', 'biotech': 'science', 'space': 'science', 'gene': 'science',
  'x402': 'tech', 'crypto': 'tech', 'blockchain': 'tech', 'protocol': 'tech',
  'regulation': 'business', 'policy': 'business', 'law': 'business',
};

function generateHashtags(bundle: ScriptBundle): string[] {
  const allText = bundle.segments.map(s => s.voiceover_text).join(' ').toLowerCase();
  const speakerTag = bundle.speaker_name.replace(/\s+/g, '').toLowerCase();

  const clustersFound = new Set<keyof typeof HASHTAG_BANK>();
  for (const [keyword, cluster] of Object.entries(TOPIC_KEYWORDS)) {
    if (allText.includes(keyword)) clustersFound.add(cluster);
  }
  if (clustersFound.size === 0) clustersFound.add('viral');

  const topicTags: string[] = [];
  for (const cluster of clustersFound) {
    const pool = HASHTAG_BANK[cluster];
    topicTags.push(pool[0]);
    if (topicTags.length < 3 && pool[1]) topicTags.push(pool[1]);
  }

  const final = [speakerTag, ...topicTags, 'learnontiktok', 'knowledge'];
  const unique = [...new Set(final)].slice(0, 5);
  while (unique.length < 3) unique.push('fyp');
  return unique;
}

// Build platform caption: hook text first (max 80 chars), hashtags inline at end
function buildCaption(bundle: ScriptBundle): string {
  const hook = bundle.segments.find(s => s.segment_name === 'hook');
  const hookText = (hook?.voiceover_text ?? '').substring(0, 80);
  const hashtags = generateHashtags(bundle).map(t => '#' + t).join(' ');
  return (hookText + '\n\n' + hashtags).substring(0, 300);
}

export class PublishingAgent {
  private tiktokClient: TikTokClient;
  private blotatoClient: BlotatoClient;
  private mode: 'mock' | 'live';
  private hostingService: VideoHostingService | null;
  private usesBlotato: boolean;

  constructor(mode: 'mock' | 'live' = 'mock') {
    this.mode = mode;
    this.tiktokClient = new TikTokClient();
    this.blotatoClient = new BlotatoClient();
    this.usesBlotato = BlotatoClient.isConfigured() || mode === 'mock'; // Always use Blotato path (dry-run in mock)
    this.hostingService = VideoHostingService.isConfigured() ? new VideoHostingService() : null;

    if (this.usesBlotato) {
      console.log('[PublishingAgent] Blotato multi-platform mode — 9 platforms');
    } else {
      console.log('[PublishingAgent] TikTok-only fallback (no BLOTATO_API_KEY)');
    }
  }

  async run(
    gates: QualityControlGate[],
    captionedVideos: CaptionedVideo[],
    bundles: ScriptBundle[],
  ): Promise<PublishedVideo[]> {
    const passedGates = gates.filter(g => g.overall_pass);
    const passedIds = new Set(passedGates.map(g => g.video_id));

    console.log('[PublishingAgent] ' + passedGates.length + '/' + gates.length + ' passed QC gate');

    if (passedGates.length === 0) {
      console.log('[PublishingAgent] No videos passed QC — nothing to publish');
      return [];
    }

    const captionMap = new Map<string, CaptionedVideo>();
    for (const cv of captionedVideos) captionMap.set(cv.video_id, cv);

    const bundleByIndex = new Map<string, ScriptBundle>();
    const passedVideoIds = [...passedIds];
    for (let i = 0; i < Math.min(passedVideoIds.length, bundles.length); i++) {
      bundleByIndex.set(passedVideoIds[i], bundles[i]);
    }

    const results: PublishedVideo[] = [];
    let slotIndex = 0;
    const seenHooks = new Map<string, number>();

    for (const videoId of passedIds) {
      const cv = captionMap.get(videoId);
      const bundle = bundleByIndex.get(videoId);
      if (!cv) {
        console.warn('[PublishingAgent] No CaptionedVideo for ' + videoId + ' — skipping');
        continue;
      }
      if (!bundle) {
        console.warn('[PublishingAgent] No ScriptBundle for ' + videoId + ' — skipping');
        continue;
      }

      const hashtags = generateHashtags(bundle);
      let captionText = buildCaption(bundle);
      const { slot, scheduled_post_time } = assignPostingSlot(slotIndex++);

      // Dedup: append Part N suffix if hook was already used in this batch
      const hookKey = captionText.split('\n')[0].toLowerCase().trim();
      const prior = seenHooks.get(hookKey) ?? 0;
      seenHooks.set(hookKey, prior + 1);
      if (prior > 0) {
        const hookLine = captionText.split('\n')[0];
        const rest = captionText.slice(hookLine.length);
        captionText = (hookLine + ` [Part ${prior + 1}]` + rest).substring(0, 300);
      }

      // Resolve media URL for live mode
      let resolvedMediaUrl = cv.file_path;
      if (this.mode === 'live' && this.hostingService) {
        try {
          const hosted = await this.hostingService.upload(cv.file_path, 'pub-' + new Date().toISOString().slice(0, 10));
          resolvedMediaUrl = hosted.public_url;
          console.log('[PublishingAgent] Uploaded to ' + hosted.public_url);
        } catch (err) {
          console.error('[PublishingAgent] Upload failed, using local path: ' + (err as Error).message);
        }
      }

      if (this.usesBlotato) {
        // Blotato multi-platform path
        const blotatoResults = await this.publishViaBlotato(videoId, captionText, resolvedMediaUrl, hashtags, bundle, slot, scheduled_post_time);
        results.push(...blotatoResults);
      } else {
        // TikTok-only fallback
        const tiktokResult = await this.publishViaTikTok(videoId, captionText, resolvedMediaUrl, hashtags, slot, scheduled_post_time);
        results.push(tiktokResult);
      }
    }

    const platforms = this.usesBlotato ? '9 platforms via Blotato' : 'TikTok only';
    console.log('[PublishingAgent] ' + results.length + ' publish results (' + platforms + ')');
    return results;
  }

  private async publishViaBlotato(
    videoId: string,
    captionText: string,
    mediaUrl: string,
    hashtags: string[],
    bundle: ScriptBundle,
    slot: PublishedVideo['posting_slot'],
    scheduledPostTime: string,
  ): Promise<PublishedVideo[]> {
    const hookSegment = bundle.segments.find(s => s.segment_name === 'hook');
    const title = (hookSegment?.voiceover_text ?? 'AI Insights').substring(0, 100);

    const request: BlotatoPostRequest = {
      caption: captionText,
      mediaUrl,
      mediaType: 'video',
      platforms: [...ALL_PLATFORMS],
      hashtags,
      title,
      description: captionText,
    };

    const response = await this.blotatoClient.post(request);

    // Create one PublishedVideo per successful platform
    return response.platforms
      .filter(p => p.success)
      .map(p => ({
        publish_id:          p.postId || 'pub-' + randomUUID().substring(0, 8),
        video_id:            videoId,
        platform:            p.platform,
        post_url:            p.postUrl || '',
        posted_at:           response.createdAt,
        posting_slot:        slot,
        scheduled_post_time: scheduledPostTime,
        caption_text:        captionText,
        hashtags,
        publish_method:      'blotato' as const,
        platform_results:    response.platforms,
      }));
  }

  private async publishViaTikTok(
    videoId: string,
    captionText: string,
    mediaUrl: string,
    hashtags: string[],
    slot: PublishedVideo['posting_slot'],
    scheduledPostTime: string,
  ): Promise<PublishedVideo> {
    const postOptions: TikTokPostOptions = {
      caption: captionText,
      mediaUrl,
      mediaType: 'video',
      hashtags,
      dryRun: this.mode !== 'live',
    };

    const result = await this.tiktokClient.post(postOptions);

    return {
      publish_id:          result.publishId || 'pub-' + randomUUID().substring(0, 8),
      video_id:            videoId,
      platform:            'tiktok',
      post_url:            'https://www.tiktok.com/@kognai/video/' + (result.publishId || 'dry-run'),
      posted_at:           new Date().toISOString(),
      posting_slot:        slot,
      scheduled_post_time: scheduledPostTime,
      caption_text:        captionText,
      hashtags,
      publish_method:      'tiktok-direct',
    };
  }

  /**
   * Sprint 785: Browser Use publishing path.
   * Uses Browser Use CLI to upload via Chrome Default profile.
   * Fallback when neither Blotato nor TikTok API are configured.
   * Requires: .venv-browser-use, warmup verified, OPENAI_API_KEY.
   */
  static isBrowserConfigured(): boolean {
    const { existsSync } = require('fs');
    const { join } = require('path');
    const venvPath = join(process.cwd(), '.venv-browser-use');
    const warmupPath = join(process.cwd(), 'workspace', 'scs001', 'warmup-status.json');
    if (!existsSync(venvPath)) return false;
    if (!existsSync(warmupPath)) return false;
    try {
      const status = JSON.parse(require('fs').readFileSync(warmupPath, 'utf-8'));
      return status.verified === true;
    } catch {
      return false;
    }
  }

  async publishViaBrowser(
    videoId: string,
    captionText: string,
    filePath: string,
    hashtags: string[],
    slot: PublishedVideo['posting_slot'],
    scheduledPostTime: string,
  ): Promise<PublishedVideo> {
    const { execSync } = require('child_process');
    const postScript = require('path').join(process.cwd(), 'scripts', 'scs001', 'post-tiktok.sh');
    const fullCaption = captionText + ' ' + hashtags.map(h => '#' + h).join(' ');

    try {
      execSync(
        `bash "${postScript}" "${filePath}" "${fullCaption.replace(/"/g, '\\"')}"`,
        { cwd: process.cwd(), timeout: 120_000, stdio: 'pipe' }
      );
      console.log(`[PublishingAgent] Browser upload prepared for ${videoId}`);
    } catch (err) {
      console.error(`[PublishingAgent] Browser upload failed: ${(err as Error).message}`);
    }

    return {
      publish_id:          'browser-' + randomUUID().substring(0, 8),
      video_id:            videoId,
      platform:            'tiktok',
      post_url:            'browser-upload-pending',
      posted_at:           new Date().toISOString(),
      posting_slot:        slot,
      scheduled_post_time: scheduledPostTime,
      caption_text:        fullCaption,
      hashtags,
      publish_method:      'browser-use',
    };
  }
}
