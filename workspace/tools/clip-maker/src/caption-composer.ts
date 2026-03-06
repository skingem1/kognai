/**
 * caption-composer.ts
 * Single-pass ffmpeg: blurred background composite + SRT word captions (bottom)
 * + Claude storytelling narration overlay (top) + optional background music.
 * V3: zoom-punch intro, brightness flash, caption color variety, text wrapping.
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

// TikTok-style caption color presets — one picked at random per clip
const CAPTION_PRESETS = [
  { fontcolor: 'white',    bordercolor: 'black' },
  { fontcolor: 'yellow',   bordercolor: 'black' },
  { fontcolor: 'cyan',     bordercolor: 'black' },
  { fontcolor: 'orange',   bordercolor: 'black' },
  { fontcolor: '0x39FF14', bordercolor: 'black' }, // neon green
] as const;

type CaptionPreset = typeof CAPTION_PRESETS[number];

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

/**
 * Wrap narration text at maxCharsPerLine for drawtext multi-line rendering.
 * Uses \n which drawtext reads from textfile as a line break.
 */
function wrapNarration(text: string, maxCharsPerLine: number): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const attempt = cur ? `${cur} ${w}` : w;
    if (attempt.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = attempt;
    }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

/**
 * Build a zoom expression that fires at the hook (0–2.5s, 18% punch)
 * and a mini 5% pulse at every subsequent segment boundary.
 * Zoom windows never overlap so they can be safely summed.
 */
function buildZoomExpr(narration: NarrationSegment[]): string {
  const hookZoom = `0.18*lt(t,2.5)*(1-t/2.5)`;
  const miniZooms = narration
    .slice(1, narration.length - 1) // segments 1–(N-2): skip hook and CTA
    .map(seg => {
      const t = seg.start;
      // 5% zoom pulls back to 0 over 0.4s — quick attention-snapping interrupt
      return `0.05*gt(t,${t})*lt(t,${t + 0.4})*(1-(t-${t})/0.4)`;
    });
  return [hookZoom, ...miniZooms].join('+');
}

/** Build a chain of drawtext filters for narration segments */
function narrationFilter(
  segments: NarrationSegment[],
  tmpFiles: string[],
  preset: CaptionPreset,
): string {
  const lastIdx = segments.length - 1;

  return segments.map((seg, i) => {
    const isHook = i === 0;
    const isCta  = i === lastIdx;

    // Role-aware rendering:
    //   Hook: 98px, vertically centered — maximum impact
    //   CTA:  72px, lower-third position (safe zone above TikTok UI)
    //   Body: 68px, near top — out of way of visual content
    const fontSize = isHook ? 98 : isCta ? 72 : 68;
    const yPos     = isHook ? '(h-text_h)/2'
                   : isCta  ? 'h*0.72-text_h/2'
                   :          '130';

    // CTA always white (visually distinct from content captions)
    const fontColor  = isCta ? 'white' : preset.fontcolor;
    const borderColor = 'black';

    // Pop animation: text snaps in at segment start (0.05s vs old 0.15s fade)
    // Creates a sharper, more energetic pattern interrupt on each segment change.
    const popIn = `if(lt(t-${seg.start},0.05),(t-${seg.start})/0.05,1)`;

    const maxChars = isHook ? 18 : 22;
    const text = wrapNarration(seg.text.toUpperCase(), maxChars);
    const txt = resolve('/tmp', `narr_${i}_${Date.now()}.txt`);
    writeFileSync(txt, text);
    tmpFiles.push(txt);

    return [
      `drawtext=fontfile=${FONT}`,
      `textfile=${txt}`,
      `fontsize=${fontSize}`,
      `fontcolor=${fontColor}`,
      `borderw=5`,
      `bordercolor=${borderColor}`,
      `line_spacing=10`,
      `x=(w-text_w)/2`,
      `y=${yPos}`,
      `alpha='${popIn}'`,
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

  const preset   = CAPTION_PRESETS[Math.floor(Math.random() * CAPTION_PRESETS.length)];
  const hash     = createHash('md5').update(inputPath + opts.startSeconds).digest('hex').slice(0, 8);
  const srtPath  = opts.srtSegments.length > 0 ? writeSrtFile(opts.srtSegments, hash) : null;
  const tmpFiles: string[] = srtPath ? [srtPath] : [];

  const cleanup = () => tmpFiles.forEach(f => { if (existsSync(f)) unlinkSync(f); });

  // Step 1: blurred bg composite + dynamic zoom.
  // Hook zoom: 18% pull-back over 2.5s. Mini 5% pulses at each segment boundary
  // (except hook and CTA) — pattern interrupt every ~5s, data-backed +40% retention.
  const zoomExpr = buildZoomExpr(opts.narration);
  const bgFilter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:3[bg]`,
    `[0:v]scale=w='1080*(1+${zoomExpr})':h=-2:eval=frame[fg]`,
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
    ? `[composed]subtitles='${srtPath}':force_style='${srtStyle}'[subraw]`
    : `[composed]null[subraw]`;

  // Step 3: Brightness flash at t=0 — quick pop that fades by t=0.5s for opening impact
  const flashFilter = `[subraw]eq=brightness='0.2*exp(-4*t)'[sub]`;

  // Step 4: music — if provided, trim music to clip duration and mix as audio
  const musicInputIdx = opts.musicPath ? 1 : null;
  const audioFilter = musicInputIdx !== null
    ? `;[${musicInputIdx}:a]atrim=0:${opts.durationSeconds},asetpts=PTS-STARTPTS,volume=0.6[aud]`
    : '';

  try {
    const narrFilter = narrationFilter(opts.narration, tmpFiles, preset);
    const fullFilter = `${bgFilter};${afterSub};${flashFilter};[sub]${narrFilter}[out]${audioFilter}`;

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
