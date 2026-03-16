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
import { VideoHostingService } from '../scs001-hosting/index';

export interface PublishedVideo {
  publish_id:           string;
  video_id:             string;
  platform:             'tiktok' | 'instagram_reels' | 'youtube_shorts';
  post_url:             string;
  posted_at:            string;
  posting_slot:         'morning_0700_0900' | 'midday_1200_1300' | 'evening_1800_2000' | 'late_night_2100_2300';
  scheduled_post_time:  string;  // ISO datetime for this slot
  caption_text:         string;
  hashtags:             string[];
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

  // Detect topic clusters from content
  const clustersFound = new Set<keyof typeof HASHTAG_BANK>();
  for (const [keyword, cluster] of Object.entries(TOPIC_KEYWORDS)) {
    if (allText.includes(keyword)) clustersFound.add(cluster);
  }
  if (clustersFound.size === 0) clustersFound.add('viral');

  // Pick 1-2 tags per detected cluster, prioritize highest-signal
  const topicTags: string[] = [];
  for (const cluster of clustersFound) {
    const pool = HASHTAG_BANK[cluster];
    topicTags.push(pool[0]);
    if (topicTags.length < 3 && pool[1]) topicTags.push(pool[1]);
  }

  // Always include speaker + 1-2 viral anchor tags
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
  // TikTok shows first ~80 chars before "...more" — hook goes first
  return (hookText + '\n\n' + hashtags).substring(0, 300);
}

export class PublishingAgent {
  private client: TikTokClient;
  private mode: 'mock' | 'live';
  private hostingService: VideoHostingService | null;

  constructor(mode: 'mock' | 'live' = 'mock') {
    this.mode = mode;
    this.client = new TikTokClient();
    this.hostingService = VideoHostingService.isConfigured() ? new VideoHostingService() : null;
    if (this.mode === 'live' && !this.hostingService) {
      console.warn('[PublishingAgent] WARNING: Supabase not configured — video hosting unavailable. Live posting will use local paths (TikTok PULL_FROM_URL will fail).');
    }
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
    let slotIndex = 0;
    // Track caption hook texts to prevent TikTok duplicate-content demotion
    const seenHooks = new Map<string, number>(); // normalized hook → occurrence count

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

      if (this.mode === 'live') {
        console.log('[PublishingAgent] LIVE MODE — posting to TikTok API');
      }

      // Resolve media URL: upload to Supabase Storage in live mode for TikTok PULL_FROM_URL
      let resolvedMediaUrl = cv.file_path;
      if (this.mode === 'live' && this.hostingService) {
        try {
          const hosted = await this.hostingService.upload(cv.file_path, 'pub-' + new Date().toISOString().slice(0, 10));
          resolvedMediaUrl = hosted.public_url;
          console.log('[PublishingAgent] Uploaded to ' + hosted.public_url + ' (' + hosted.size_bytes + ' bytes)');
        } catch (err) {
          console.error('[PublishingAgent] Upload failed, using local path: ' + (err as Error).message);
        }
      } else if (this.mode === 'live' && !this.hostingService) {
        console.warn('[PublishingAgent] WARNING: No hosting service — mediaUrl is local path');
      }

      const postOptions: TikTokPostOptions = {
        caption: captionText,
        // LIVE: resolvedMediaUrl is public Supabase Storage URL (uploaded above).
        // Falls back to local path if hosting not configured (TikTok will reject).
        mediaUrl: resolvedMediaUrl,
        mediaType: 'video',
        hashtags,
        dryRun: this.mode !== 'live',
      };

      const result = await this.client.post(postOptions);

      const published: PublishedVideo = {
        publish_id:          result.publishId || 'pub-' + randomUUID().substring(0, 8),
        video_id:            videoId,
        platform:            'tiktok',
        post_url:            'https://www.tiktok.com/@kognai/video/' + (result.publishId || 'dry-run'),
        posted_at:           new Date().toISOString(),
        posting_slot:        slot,
        scheduled_post_time: scheduled_post_time,
        caption_text:        captionText,
        hashtags,
      };

      results.push(published);
      console.log('[PublishingAgent] Published ' + videoId + ' → ' + published.post_url + ' (slot: ' + slot + ')');
    }

    console.log('[PublishingAgent] ' + results.length + ' videos published to TikTok');
    return results;
  }
}
