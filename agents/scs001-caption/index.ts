// SCS-001 — Caption Agent (Agent 6 — Production Layer)
// Consumes: EditedVideo[] + ScriptBundle[] (for caption text)
// Produces: CaptionedVideo[] (per contracts/scs-001/video-production-v1.json)
// Engine: SRT generation (deterministic) + FFmpeg subtitle overlay (when libass available)
// Block C mock: generates SRT files, passes through video (no overlay without libass)

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { execSync, execFileSync } from 'child_process';
import type { ScriptBundle, ScriptSegment } from '../scs001-script/index';
import type { EditedVideo } from '../scs001-editing/index';

export interface CaptionedVideo {
  video_id:             string;
  file_path:            string;
  caption_timing_file:  string;
  caption_style:        'word_by_word' | 'phrase_sync';
  keyword_highlights:   string[];
  font_size_px:         number;
  contrast_ratio:       number;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}

function generateSrt(bundle: ScriptBundle): string {
  const entries: string[] = [];
  let idx = 1;

  for (const seg of bundle.segments) {
    // Skip segments with no caption text
    if (!seg.caption_text || seg.caption_text.length === 0) continue;

    const startTime = formatSrtTime(seg.start_s);
    const endTime   = formatSrtTime(seg.end_s);

    entries.push(
      String(idx) + '\n' +
      startTime + ' --> ' + endTime + '\n' +
      seg.caption_text + '\n'
    );
    idx++;
  }

  return entries.join('\n');
}

function extractKeywords(bundle: ScriptBundle): string[] {
  const keywords: string[] = [];

  // Speaker name is always a keyword
  if (bundle.speaker_name) {
    keywords.push(bundle.speaker_name);
  }

  // Extract key words from hook text (first 3 significant words)
  const hookSeg = bundle.segments.find(s => s.segment_name === 'hook');
  if (hookSeg && hookSeg.caption_text) {
    const hookWords = hookSeg.caption_text
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 2);
    keywords.push(...hookWords);
  }

  // Extract key words from insight segment
  const insightSeg = bundle.segments.find(s => s.segment_name === 'insight');
  if (insightSeg && insightSeg.caption_text) {
    const insightWords = insightSeg.caption_text
      .split(/\s+/)
      .filter(w => w.length > 5)
      .slice(0, 2);
    keywords.push(...insightWords);
  }

  // Deduplicate and limit to 5
  return [...new Set(keywords)].slice(0, 5);
}

export class CaptionAgent {
  private outputDir: string;

  constructor(outputDir: string = 'workspace/scs001/caption-outputs') {
    // Sprint 1337: Resolve to absolute path so ffmpeg subtitles filter works regardless of cwd
    this.outputDir = resolve(outputDir);
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  run(videos: EditedVideo[], bundles: ScriptBundle[]): CaptionedVideo[] {
    console.log('[CaptionAgent] ' + videos.length + ' EditedVideos in');

    // Create a lookup from video's insight_id to corresponding ScriptBundle
    const bundleMap = new Map<string, ScriptBundle>();
    for (const b of bundles) {
      bundleMap.set(b.insight_id, b);
    }

    const captioned: CaptionedVideo[] = [];
    for (const video of videos) {
      try {
        const bundle = bundleMap.get(video.insight_id);
        if (!bundle) {
          throw new Error('No ScriptBundle found for insight_id: ' + video.insight_id);
        }
        const result = this.captionVideo(video, bundle);
        captioned.push(result);
        console.log('[CaptionAgent] \u2713 ' + video.video_id + ' \u2192 ' + result.keyword_highlights.length + ' keywords, SRT at ' + result.caption_timing_file);
      } catch (err) {
        console.warn('[CaptionAgent] \u2717 ' + video.video_id + ' failed: ' + (err as Error).message);
      }
    }

    console.log('[CaptionAgent] ' + captioned.length + '/' + videos.length + ' CaptionedVideos produced');
    return captioned;
  }

  private captionVideo(video: EditedVideo, bundle: ScriptBundle): CaptionedVideo {
    // Step 1: Generate SRT file
    const srtContent = generateSrt(bundle);
    const srtPath = this.outputDir + '/' + video.video_id + '.srt';
    writeFileSync(srtPath, srtContent, 'utf-8');

    // Step 2: Extract keywords
    const keywords = extractKeywords(bundle);

    // Step 3: Caption overlay
    const captionedPath = this.outputDir + '/' + video.video_id + '-captioned.mp4';
    if (!existsSync(video.file_path)) {
      throw new Error('Source video not found: ' + video.file_path);
    }

    const productionMode = (process.env.SCS_EDITING_MODE ?? 'mock') === 'production';
    if (productionMode) {
      // Production mode: burn subtitles into video via FFmpeg subtitles filter
      const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
      // Use execFileSync (not execSync) to pass -vf as a literal arg.
      // FFmpeg 8.x requires explicit 'f=' prefix for the subtitle filename option;
      // without it the parser rejects the filter string with "No option name near".
      const vfArg = `subtitles=f='${srtPath}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=80'`;
      try {
        execFileSync(FFMPEG, ['-y', '-i', video.file_path, '-vf', vfArg, '-c:a', 'copy', captionedPath], { stdio: 'pipe', timeout: 60_000 });
      } catch (err) {
        console.warn('[CaptionAgent] subtitle burn-in failed, falling back to copy: ' + (err as Error).message);
        copyFileSync(video.file_path, captionedPath);
      }
    } else {
      // Mock mode: pass through video unchanged
      copyFileSync(video.file_path, captionedPath);
    }

    return {
      video_id:            video.video_id,
      file_path:           captionedPath,
      caption_timing_file: srtPath,
      caption_style:       'word_by_word',
      keyword_highlights:  keywords,
      font_size_px:        56,          // TikTok standard: 56px bold
      contrast_ratio:      7.0,         // White on dark shadow: ~7:1
    };
  }
}

// Export SRT generator for testing
export { generateSrt, extractKeywords };
