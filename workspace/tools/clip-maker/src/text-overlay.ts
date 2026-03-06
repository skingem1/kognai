/**
 * text-overlay.ts
 * Burns TikTok-style hook text onto a 1080x1920 clip using ffmpeg drawtext.
 * Font: Impact — white fill, 4px black border, centered, visible for first 4 seconds.
 */

import ffmpegStatic from 'ffmpeg-static';
import Ffmpeg from 'fluent-ffmpeg';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

Ffmpeg.setFfmpegPath(ffmpegStatic!);

const FONT_PATH = '/System/Library/Fonts/Supplemental/Impact.ttf';

export interface OverlayOptions {
  hookText: string;
  hookDuration?: number; // seconds to show hook (default: 4)
  fontSize?: number;     // default: 82
  fontColor?: string;    // default: white
  borderWidth?: number;  // default: 4
}

/** Wraps hook text at word boundaries, max ~20 chars per line. */
function wrapHook(text: string, maxChars = 20): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > maxChars && cur) {
      lines.push(cur.trim());
      cur = w + ' ';
    } else {
      cur += w + ' ';
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join('\n');
}

/**
 * Applies hook text overlay to inputPath → outputPath.
 * Text is Impact font, centered, white with black border, shown for hookDuration seconds.
 */
export async function applyTextOverlay(
  inputPath: string,
  outputPath: string,
  opts: OverlayOptions
): Promise<void> {
  const hookDuration = opts.hookDuration ?? 4;
  const fontSize = opts.fontSize ?? 82;
  const fontColor = opts.fontColor ?? 'white';
  const borderWidth = opts.borderWidth ?? 4;

  await mkdir(dirname(outputPath), { recursive: true });

  // Write text to temp file — avoids all ffmpeg colon/quote escaping headaches
  const hash = createHash('md5').update(opts.hookText).digest('hex').substring(0, 8);
  const tmpFile = `/tmp/hook_${hash}.txt`;
  writeFileSync(tmpFile, wrapHook(opts.hookText));

  const drawtext = [
    `fontfile=${FONT_PATH}`,
    `textfile=${tmpFile}`,
    `fontsize=${fontSize}`,
    `fontcolor=${fontColor}`,
    `borderw=${borderWidth}`,
    `bordercolor=black`,
    `line_spacing=10`,
    `x=(w-text_w)/2`,
    `y=(h/2)-180`,
    `enable='between(t,0,${hookDuration})'`,
  ].join(':');

  return new Promise((resolve, reject) => {
    Ffmpeg(inputPath)
      .videoFilter(`drawtext=${drawtext}`)
      .videoCodec('libx264')
      .addOption('-crf', '20')
      .addOption('-preset', 'fast')
      .audioCodec('copy')
      .outputOptions('-movflags', '+faststart')
      .output(outputPath)
      .on('end', () => {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
        resolve();
      })
      .on('error', (err: Error) => {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
        reject(new Error(`overlay error: ${err.message}`));
      })
      .run();
  });
}
