/**
 * caption-composer.ts
 * Single-pass ffmpeg: blurred background composite + SRT word captions (bottom)
 * + Claude storytelling narration overlay (top). Replaces clip-extractor + text-overlay.
 */

import ffmpegStatic from 'ffmpeg-static';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { createHash } from 'crypto';
import type { SrtSegment } from './ia-srt-fetcher.js';
import type { NarrationSegment } from './scene-selector.js';

Ffmpeg.setFfmpegPath(ffmpegStatic!);

const FONT = '/System/Library/Fonts/Supplemental/Impact.ttf';

export interface ComposeOptions {
  startSeconds: number;
  durationSeconds: number;
  srtSegments: SrtSegment[];      // 0-based, for bottom captions
  narration: NarrationSegment[];  // 0-based, for top overlay
}

/** Write SRT segments to a temp file, return path */
function writeSrtFile(segments: SrtSegment[], hash: string): string {
  const path = resolve('/tmp', `captions_${hash}.srt`);
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    const ms = Math.round((s % 1) * 1000).toString().padStart(3, '0');
    return `${h}:${m}:${sec},${ms}`;
  };
  const content = segments.map(s =>
    `${s.index}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}\n`
  ).join('\n');
  writeFileSync(path, content);
  return path;
}

/** Build a chain of drawtext filters for narration segments */
function narrationFilter(segments: NarrationSegment[], tmpFiles: string[]): string {
  return segments.map((seg, i) => {
    const txt = resolve('/tmp', `narr_${i}_${Date.now()}.txt`);
    writeFileSync(txt, seg.text.toUpperCase());
    tmpFiles.push(txt);
    return [
      `drawtext=fontfile=${FONT}`,
      `textfile=${txt}`,
      `fontsize=72`,
      `fontcolor=white`,
      `borderw=4`,
      `bordercolor=black`,
      `line_spacing=8`,
      `x=(w-text_w)/2`,
      `y=160`,
      `enable='between(t,${seg.start},${seg.end})'`,
    ].join(':');
  }).join(',');
}

export async function composeClip(
  inputPath: string,
  outputPath: string,
  opts: ComposeOptions,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });

  const hash = createHash('md5').update(inputPath + opts.startSeconds).digest('hex').slice(0, 8);
  const srtPath = opts.srtSegments.length > 0 ? writeSrtFile(opts.srtSegments, hash) : null;
  const tmpFiles: string[] = srtPath ? [srtPath] : [];

  const cleanup = () => tmpFiles.forEach(f => { if (existsSync(f)) unlinkSync(f); });

  // Step 1: blurred bg composite filter
  const bgFilter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:3[bg]`,
    `[0:v]scale=1080:-2[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[composed]`,
  ].join(';');

  // Step 2: SRT captions at bottom (if available)
  const srtStyle = 'FontName=Impact,FontSize=38,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,MarginV=80,Alignment=2';
  const afterSub = srtPath
    ? `[composed]subtitles='${srtPath}':force_style='${srtStyle}'[sub]`
    : `[composed]null[sub]`;

  // Step 3: narration drawtext chain on top
  try {
    const narrFilter = narrationFilter(opts.narration, tmpFiles);
    const fullFilter = `${bgFilter};${afterSub};[sub]${narrFilter}[out]`;

    return await new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .setStartTime(opts.startSeconds)
        .setDuration(opts.durationSeconds)
        .complexFilter(fullFilter, 'out')
        .videoCodec('libx264')
        .addOption('-crf', '22')
        .addOption('-preset', 'fast')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions('-movflags', '+faststart')
        .output(outputPath)
        .on('end', () => { cleanup(); resolve(); })
        .on('error', (err: Error) => { cleanup(); reject(new Error(`compose error: ${err.message}`)); })
        .run();
    });
  } catch (err) {
    cleanup(); // ensure cleanup if narrationFilter() throws or ffmpeg rejects before callback
    throw err;
  }
}
