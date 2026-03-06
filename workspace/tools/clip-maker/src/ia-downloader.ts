/**
 * ia-downloader.ts
 * Fetches IA metadata, selects best video file, streams download to disk.
 */

import { createWriteStream, existsSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export interface IAVideoFile {
  filename: string;
  format: string;
  sizeBytes: number;
  url: string;
}

const FORMAT_PRIORITY = ['512Kb MPEG4', 'h.264', 'Ogg Video', 'Cinepack'];
const MAX_SIZE = 200 * 1024 * 1024; // 200MB cap
const VIDEO_EXTS = ['.mp4', '.avi', '.ogv', '.mpeg', '.mpg', '.mkv', '.m4v'];

/** Returns the best available video file for an IA identifier. */
export async function getBestVideoFile(identifier: string): Promise<IAVideoFile | null> {
  const res = await fetch(`https://archive.org/metadata/${identifier}`);
  if (!res.ok) throw new Error(`IA metadata fetch failed: ${res.status} for ${identifier}`);
  const data = await res.json() as { files?: Array<Record<string, string>> };
  const files = data.files ?? [];

  const candidates = files.filter(f =>
    VIDEO_EXTS.some(ext => f.name?.toLowerCase().endsWith(ext))
  );

  // Try priority formats first; skip h.264 if >200MB
  for (const fmt of FORMAT_PRIORITY) {
    const match = candidates.find(f => f.format === fmt);
    if (!match) continue;
    const sz = parseInt(match.size ?? '0', 10);
    if (fmt === 'h.264' && sz > MAX_SIZE) continue;
    return {
      filename: match.name,
      format: fmt,
      sizeBytes: sz,
      url: `https://archive.org/download/${identifier}/${match.name}`,
    };
  }

  // Fallback: any .mp4 under 200MB
  const fallback = candidates
    .filter(f => f.name?.toLowerCase().endsWith('.mp4') && parseInt(f.size ?? '0', 10) < MAX_SIZE)
    .sort((a, b) => parseInt(a.size ?? '0', 10) - parseInt(b.size ?? '0', 10))[0];

  if (!fallback) return null;
  const sz = parseInt(fallback.size ?? '0', 10);
  return { filename: fallback.name, format: fallback.format ?? 'mp4', sizeBytes: sz,
    url: `https://archive.org/download/${identifier}/${fallback.name}` };
}

/**
 * Downloads the best video for identifier to destDir/{identifier}.mp4.
 * Skips if already downloaded and size matches. Returns local path.
 */
export async function downloadVideo(
  identifier: string,
  destDir: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const outPath = `${destDir}/${identifier}.mp4`;
  const file = await getBestVideoFile(identifier);
  if (!file) throw new Error(`No suitable video found for ${identifier}`);

  // Skip if already on disk and size matches
  if (existsSync(outPath) && statSync(outPath).size === file.sizeBytes) {
    onProgress?.(100);
    return outPath;
  }

  console.log(`  ↓ Downloading ${identifier} (${(file.sizeBytes / 1024 / 1024).toFixed(0)}MB) — ${file.format}`);
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${file.url}`);

  const total = file.sizeBytes;
  let received = 0;
  let lastPct = -1;

  const writer = createWriteStream(outPath);
  const readable = Readable.from(
    (async function* () {
      const reader = res.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        const pct = Math.floor((received / total) * 100);
        if (pct >= lastPct + 10) { lastPct = pct; onProgress?.(pct); }
        yield Buffer.from(value);
      }
    })()
  );

  await pipeline(readable, writer);
  return outPath;
}
