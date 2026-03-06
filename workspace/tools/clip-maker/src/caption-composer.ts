/**
 * caption-composer.ts
 * Single-pass ffmpeg: blurred background composite + SRT word captions (bottom)
 * + Claude storytelling narration overlay (top) + optional background music.
 * Replaces clip-extractor + text-overlay.
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
  musicPath?: string;             // optional royalty-free background track
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
  // Wrap long lines at 38 chars to prevent libass truncation
  const wrapLine = (t: string) => {
    const words = t.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 38 && current) {
        lines.push(current.trim());
        current = word;
      } else {
        current = (current + ' ' + word).trim();
      }
    }
    if (current) lines.push(current);
    return lines.join('\n');
  };
  const content = segments.map(s =>
    `${s.index}\n${fmt(s.start)} --> ${fmt(s.end)}\n${wrapLine(s.text)}\n`
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

  // Step 2: SRT captions at bottom — PlayResX/Y fixes libass truncation on 1080x1920
  const srtStyle = [
    'PlayResX=1080', 'PlayResY=1920', 'WrapStyle=1',
    'FontName=Impact', 'FontSize=38',
    'PrimaryColour=&H00FFFFFF', 'OutlineColour=&H00000000',
    'BorderStyle=1', 'Outline=3',
    'MarginL=20', 'MarginR=20', 'MarginV=80', 'Alignment=2',
  ].join(',');
  const afterSub = srtPath
    ? `[composed]subtitles='${srtPath}':force_style='${srtStyle}'[sub]`
    : `[composed]null[sub]`;

  // Step 3: narration drawtext chain on top
  // Step 4: music — if provided, trim music to clip duration and mix as audio
  const musicInputIdx = opts.musicPath ? 1 : null;
  const audioFilter = musicInputIdx !== null
    ? `;[${musicInputIdx}:a]atrim=0:${opts.durationSeconds},asetpts=PTS-STARTPTS,volume=0.6[aud]`
    : '';

  try {
    const narrFilter = narrationFilter(opts.narration, tmpFiles);
    const fullFilter = `${bgFilter};${afterSub};[sub]${narrFilter}[out]${audioFilter}`;

    return await new Promise<void>((res, rej) => {
      const cmd = Ffmpeg(inputPath)
        .setStartTime(opts.startSeconds)
        .setDuration(opts.durationSeconds);

      if (opts.musicPath) cmd.addInput(opts.musicPath);

      cmd
        .addOption('-filter_complex', fullFilter)
        .addOption('-map', '[out]')
        .addOption('-map', musicInputIdx !== null ? '[aud]' : '0:a?')
        .videoCodec('libx264')
        .addOption('-crf', '22')
        .addOption('-preset', 'fast')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions('-movflags', '+faststart')
        .output(outputPath)
        .on('end', () => { cleanup(); res(); })
        .on('error', (err: Error) => { cleanup(); rej(new Error(`compose error: ${err.message}`)); })
        .run();
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}
