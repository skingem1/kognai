// SCS-001 — Publishing Agent (Agent 8 — Distribution Layer)
// Consumes: QualityControlGate[] (passed only) + CaptionedVideo[] + ScriptBundle[]
// Produces: PublishedVideo[] (per contracts/scs-001/publishing-analytics-v1.json)
// Engine: Deterministic — caption assembly + TikTokClient dispatch (dry-run default)
// Block E: TikTok primary. Multi-platform in Block G.

import { randomUUID } from 'crypto';
import type { QualityControlGate } from '../scs001-qc/index';
import type { CaptionedVideo } from '../scs001-caption/index';
import type { ScriptBundle } from '../scs001-script/index';
import { TikTokClient, TikTokPostOptions } from '../tiktok-client/index';

export interface PublishedVideo {
  publish_id:    string;
  video_id:      string;
  platform:      'tiktok' | 'instagram_reels' | 'youtube_shorts';
  post_url:      string;
  posted_at:     string;
  posting_slot:  'morning_0700_0900' | 'midday_1200_1300' | 'evening_1800_2000' | 'late_night_2100_2300';
  caption_text:  string;
  hashtags:      string[];
}

// Time-slot assignment based on current hour
function assignPostingSlot(): PublishedVideo['posting_slot'] {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 9)   return 'morning_0700_0900';
  if (hour >= 12 && hour < 13) return 'midday_1200_1300';
  if (hour >= 18 && hour < 20) return 'evening_1800_2000';
  if (hour >= 21 && hour < 23) return 'late_night_2100_2300';
  // Default to evening slot (highest engagement per Charter)
  return 'evening_1800_2000';
}

// Extract 3-5 hashtags from the script bundle
function generateHashtags(bundle: ScriptBundle): string[] {
  const tags: string[] = [];

  // Speaker-derived tag (if notable)
  const speaker = bundle.speaker_name ?? '';
  if (speaker && speaker.length > 2) {
    tags.push(speaker.replace(/\s+/g, '').toLowerCase());
  }

  // Hook formula tag
  const formula = bundle.hook_formula_used ?? '';
  if (formula) {
    tags.push(formula.replace(/_/g, ''));
  }

  // Fixed brand/niche tags
  tags.push('knowledge', 'learnontiktok', 'deepdive');

  // Deduplicate and limit to 5
  const unique = [...new Set(tags)].slice(0, 5);

  // Ensure minimum 3
  while (unique.length < 3) {
    unique.push('viral');
  }

  return unique;
}

// Build platform caption from script bundle
function buildCaption(bundle: ScriptBundle): string {
  const hook = bundle.segments.find(s => s.segment_name === 'hook');
  const insight = bundle.segments.find(s => s.segment_name === 'insight');
  const hookText = hook?.voiceover_text ?? '';
  const insightText = insight?.voiceover_text ?? '';

  // TikTok caption: hook line + insight teaser (max 150 chars for visibility)
  let caption = hookText;
  if (insightText && caption.length + insightText.length < 140) {
    caption += ' ' + insightText;
  }
  return caption.substring(0, 150);
}

export class PublishingAgent {
  private client: TikTokClient;

  constructor() {
    this.client = new TikTokClient();
  }

  async run(
    gates: QualityControlGate[],
    captionedVideos: CaptionedVideo[],
    bundles: ScriptBundle[],
  ): Promise<PublishedVideo[]> {
    // Filter to QC-passed only
    const passedGates = gates.filter(g => g.overall_pass);
    const passedIds = new Set(passedGates.map(g => g.video_id));

    console.log('[PublishingAgent] ' + passedGates.length + '/' + gates.length + ' passed QC gate');

    if (passedGates.length === 0) {
      console.log('[PublishingAgent] No videos passed QC — nothing to publish');
      return [];
    }

    // Build lookup maps
    const captionMap = new Map<string, CaptionedVideo>();
    for (const cv of captionedVideos) captionMap.set(cv.video_id, cv);

    // Bundle map: need to match via editing's insight_id
    // For pipeline: video_id → CaptionedVideo → file_path, bundles matched by index
    const bundleByIndex = new Map<string, ScriptBundle>();
    // We need a way to link video_id → bundle. The chain is:
    // bundle.insight_id → EditedVideo.insight_id → EditedVideo.video_id
    // Since we don't have EditedVideo here, use gate order matching bundle order
    const passedVideoIds = [...passedIds];
    for (let i = 0; i < Math.min(passedVideoIds.length, bundles.length); i++) {
      bundleByIndex.set(passedVideoIds[i], bundles[i]);
    }

    const results: PublishedVideo[] = [];
    const slot = assignPostingSlot();

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
      const captionText = buildCaption(bundle);

      const postOptions: TikTokPostOptions = {
        caption: captionText,
        mediaUrl: cv.file_path,
        mediaType: 'video',
        hashtags,
        dryRun: true, // Default dry-run until TikTok API approved
      };

      const result = await this.client.post(postOptions);

      const published: PublishedVideo = {
        publish_id:   result.publishId || 'pub-' + randomUUID().substring(0, 8),
        video_id:     videoId,
        platform:     'tiktok',
        post_url:     'https://www.tiktok.com/@kognai/video/' + (result.publishId || 'dry-run'),
        posted_at:    new Date().toISOString(),
        posting_slot: slot,
        caption_text: captionText,
        hashtags,
      };

      results.push(published);
      console.log('[PublishingAgent] Published ' + videoId + ' → ' + published.post_url + ' (slot: ' + slot + ')');
    }

    console.log('[PublishingAgent] ' + results.length + ' videos published to TikTok');
    return results;
  }
}
