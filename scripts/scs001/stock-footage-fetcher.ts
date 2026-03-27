/**
 * stock-footage-fetcher.ts — Free Pexels stock footage for P3/P4 cost reduction
 *
 * Strategy:
 *   Scene 1 (hero): Always AI-generated (Kling — best quality)
 *   Scene 2+:       Try Pexels first → fall back to AI if no match
 *
 * Keyword extraction uses voiceover_text as the primary source of topic keywords
 * (it directly states what the scene is about), with visual_prompt as supplement.
 * A minimum of 2 distinct topic words is required — single-word searches are too
 * generic and return irrelevant stock. If no specific match is found, the caller
 * falls back to LTX AI generation.
 *
 * Pexels API is free with no attribution required for commercial use.
 * Portrait videos are downloaded, cropped to 1080x1920, trimmed to duration_s.
 * Photo fallback applies Ken Burns (slow zoom) when no video is found.
 *
 * Sprint 1421 — Stock footage integration for P3/P4 cost reduction
 * Sprint 1422 — Voiceover-first keyword extraction for strict topic relevance
 */

import { execSync } from 'child_process';
import { existsSync, createWriteStream } from 'fs';
import { join } from 'path';
import * as https from 'https';
import * as http from 'http';

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const FFMPEG = process.env.FFMPEG_BIN || '/opt/homebrew/bin/ffmpeg';

// ── Keyword extraction ────────────────────────────────────────────────────────

/** Shot-type / cinematography terms to strip before building search queries */
const SHOT_TERMS = [
  'macro shot', 'close-up of a', 'close-up of', 'closeup', 'wide shot',
  'aerial shot', 'aerial view', 'aerial perspective',
  'slow-motion shot', 'slow motion', 'slow-motion',
  'time-lapse of a', 'time-lapse of', 'time-lapse', 'timelapse',
  'dramatic shot', 'dramatic wide shot', 'dramatic close-up',
  'tracking shot', 'overhead shot', 'establishing shot',
  'extreme close-up', 'medium shot', 'cinematic', 'spectacular',
  'no text or writing visible', 'photorealistic', 'vertical 9:16',
  'depth of field', 'bokeh', 'shallow dof',
];

/** Filler/descriptor words that add nothing to a search query */
const FILLER_RE = /\b(of|a|an|the|in|on|at|with|from|and|or|to|into|as|mid|shot|view|angle|perspective|scene|frame|detail|focus|look|feel|atmosphere|mood|style|color|light|lighting|glow|dark|bright|blur|effect|dramatic|spectacular|breathtaking|beautiful|stunning|amazing|incredible|vast|huge|tiny|small|large|big|speed|fast|slow|motion|movement|glowing|iridescent|golden|cinematic|macro|micro|photo|realistic|vertical|contrast|vivid|rich|deep|sharp|soft|high|low|wide|narrow)\b/gi;

/**
 * Common English stop words — stripped from voiceover keyword extraction.
 * We keep domain-specific nouns (animals, places, people names, etc.).
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'with', 'from', 'and', 'or', 'to', 'into',
  'as', 'of', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have',
  'had', 'do', 'did', 'does', 'not', 'no', 'but', 'if', 'for', 'by', 'this', 'that',
  'than', 'then', 'so', 'more', 'most', 'can', 'could', 'would', 'should', 'will',
  'just', 'even', 'also', 'about', 'after', 'before', 'during', 'while', 'when',
  'where', 'which', 'who', 'what', 'how', 'why', 'time', 'year', 'years', 'day',
  'days', 'way', 'same', 'first', 'last', 'once', 'twice', 'never', 'always', 'often',
  'today', 'now', 'still', 'already', 'only', 'very', 'much', 'many', 'few',
  'lot', 'lots', 'each', 'every', 'all', 'some', 'any', 'our', 'your', 'their',
  'his', 'her', 'we', 'they', 'you', 'he', 'she', 'born', 'built', 'made',
  'took', 'found', 'known', 'called', 'used', 'closer', 'close', 'number',
  'fact', 'true', 'false', 'right', 'left', 'back', 'front', 'thing', 'things',
]);

/**
 * Extract 2-4 topic-relevant keyword search terms.
 *
 * Strategy (voiceover-first):
 *   1. Voiceover proper nouns (capitalised mid-sentence) — most specific
 *   2. Voiceover content words (non-stopword, length > 3) from first sentence
 *   3. Visual prompt subject (after stripping cinematography jargon) as supplement
 *
 * Returns empty string if fewer than 2 distinct meaningful words can be extracted,
 * which causes fetchStockScene to skip Pexels and go straight to AI.
 *
 * @param visualPrompt  Full visual prompt from the script
 * @param voiceoverText Voiceover narration for this scene (primary topic source)
 */
export function extractKeywords(visualPrompt: string, voiceoverText?: string): string {
  const candidates: string[] = [];

  // ── 1. Voiceover-first: primary source of topic keywords ───────────────────
  if (voiceoverText) {
    // Use only the first sentence — most topically concentrated
    const firstSentence = voiceoverText.split(/[.!?]/)[0] || voiceoverText;
    const rawWords = firstSentence.trim().split(/\s+/);

    // Proper nouns: capitalised mid-sentence (index > 0) are almost always
    // named entities — people, places, civilisations, species, technologies
    for (let i = 1; i < rawWords.length; i++) {
      const clean = rawWords[i].replace(/[^a-zA-Z]/g, '');
      if (clean.length > 2 && /^[A-Z]/.test(clean) && !STOP_WORDS.has(clean.toLowerCase())) {
        candidates.push(clean.toLowerCase());
      }
    }

    // Content nouns: non-stopword words of length > 3 from the first sentence
    const voiceClean = firstSentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    for (const w of voiceClean.split(/\s+/)) {
      if (w.length > 3 && !STOP_WORDS.has(w) && !candidates.includes(w)) {
        candidates.push(w);
        if (candidates.length >= 5) break; // cap voiceover contribution at 5
      }
    }
  }

  // ── 2. Visual prompt: supplement with core subject ─────────────────────────
  let text = visualPrompt.toLowerCase();
  const sortedTerms = [...SHOT_TERMS].sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    text = text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  // Strip possessives and hyphenated compound prefixes (mid-, no-, etc.)
  text = text.replace(/'\w+/g, '').replace(/\b\w+-/g, '').replace(/-\w+/g, '');

  // Take first meaningful chunk (before first comma) — that's the subject
  const firstChunk = text.split(',')[0].trim();
  const visualCleaned = firstChunk
    .replace(FILLER_RE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const w of visualCleaned.split(/\s+/)) {
    if (w.length > 2 && !STOP_WORDS.has(w) && !candidates.includes(w)) {
      candidates.push(w);
    }
  }

  // ── 3. Return top 4 — voiceover proper nouns always come first ─────────────
  return candidates.slice(0, 4).join(' ');
}

// ── HTTP download ─────────────────────────────────────────────────────────────

async function downloadFile(url: string, localPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const file = createWriteStream(localPath);
    proto.get(url, (res) => {
      if (res.statusCode !== 200) { file.close(); resolve(false); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', () => resolve(false));
    }).on('error', () => resolve(false));
  });
}

// ── Pexels video ──────────────────────────────────────────────────────────────

/**
 * Search Pexels for a portrait video matching `query`.
 * Downloads, normalises to 1080×1920, trims to durationS.
 */
async function fetchPexelsVideo(
  query: string,
  durationS: number,
  outputPath: string,
): Promise<boolean> {
  if (!PEXELS_API_KEY) return false;

  const url =
    `https://api.pexels.com/videos/search` +
    `?query=${encodeURIComponent(query)}` +
    `&orientation=portrait&per_page=5&size=medium`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return false;

    const data: any = await res.json();
    const videos: any[] = data.videos || [];
    if (videos.length === 0) return false;

    // Prefer videos longer than or equal to durationS (so we can trim cleanly)
    const suitable = videos
      .filter(v => v.duration >= Math.max(durationS - 1, 2))
      .sort((a, b) => Math.abs(a.duration - durationS) - Math.abs(b.duration - durationS));

    const chosen = suitable[0] || videos[0];
    const files: any[] = chosen.video_files || [];

    // SD first (fast download), fall back to HD
    const file =
      files.find(f => f.quality === 'sd' && f.height >= 480) ||
      files.find(f => f.quality === 'hd' && f.height >= 720) ||
      files[0];
    if (!file?.link) return false;

    const tmpRaw = outputPath.replace('.mp4', '_pxraw.mp4');
    const downloaded = await downloadFile(file.link, tmpRaw);
    if (!downloaded || !existsSync(tmpRaw)) return false;

    // Normalise to 1080×1920, trim to durationS
    execSync(
      `${FFMPEG} -y -i "${tmpRaw}" -t ${durationS} ` +
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" ` +
      `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an "${outputPath}"`,
      { stdio: 'pipe', timeout: 90000 },
    );

    try { execSync(`rm "${tmpRaw}"`, { stdio: 'pipe' }); } catch {}
    return existsSync(outputPath);
  } catch {
    return false;
  }
}

// ── Pexels photo → video (Ken Burns fallback) ─────────────────────────────────

/**
 * Search Pexels for a portrait photo and animate it with a slow Ken Burns zoom.
 * Used when no video match is found.
 */
async function fetchPexelsPhoto(
  query: string,
  durationS: number,
  outputPath: string,
): Promise<boolean> {
  if (!PEXELS_API_KEY) return false;

  const url =
    `https://api.pexels.com/v1/search` +
    `?query=${encodeURIComponent(query)}&orientation=portrait&per_page=3`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: PEXELS_API_KEY },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return false;

    const data: any = await res.json();
    const photos: any[] = data.photos || [];
    if (photos.length === 0) return false;

    const imgUrl = photos[0].src?.portrait || photos[0].src?.large2x || photos[0].src?.large;
    if (!imgUrl) return false;

    const tmpImg = outputPath.replace('.mp4', '_pxphoto.jpg');
    const downloaded = await downloadFile(imgUrl, tmpImg);
    if (!downloaded || !existsSync(tmpImg)) return false;

    // Ken Burns: slow zoom-in over durationS seconds (z: 1.0 → 1.1)
    const fps = 30;
    const totalFrames = durationS * fps;
    const zoomFilter =
      `scale=2160:3840,` +
      `zoompan=z='min(zoom+0.00033,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1920:fps=${fps}`;

    execSync(
      `${FFMPEG} -y -loop 1 -i "${tmpImg}" -vf "${zoomFilter}" ` +
      `-t ${durationS} -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -an "${outputPath}"`,
      { stdio: 'pipe', timeout: 120000 },
    );

    try { execSync(`rm "${tmpImg}"`, { stdio: 'pipe' }); } catch {}
    return existsSync(outputPath);
  } catch {
    return false;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Try to get a free stock scene for a visual_prompt.
 * Writes result to outputPath (same interface as generateSceneClip).
 *
 * Returns true if a stock clip was produced, false if caller should use AI.
 *
 * Keyword extraction uses voiceover_text as the primary topic source to ensure
 * the stock footage is strictly relevant to what is being narrated.
 * A minimum of 2 distinct words is required — single-word queries return
 * generic, unrelated results and are rejected in favour of AI generation.
 *
 * @param visualPrompt  Full visual prompt from the script
 * @param voiceoverText Voiceover narration for this scene (primary topic source)
 * @param durationS     Target duration in seconds
 * @param outputPath    Where to write the normalised MP4
 */
export async function fetchStockScene(
  visualPrompt: string,
  voiceoverText: string | undefined,
  durationS: number,
  outputPath: string,
): Promise<boolean> {
  if (!PEXELS_API_KEY) return false;

  const keywords = extractKeywords(visualPrompt, voiceoverText);

  // Require at least 2 distinct words — single-word searches are too generic
  // and produce irrelevant stock that breaks topic consistency
  if (!keywords) return false;
  const wordCount = keywords.trim().split(/\s+/).length;
  if (wordCount < 2 || keywords.replace(/\s+/g, '').length < 6) return false;

  console.log(`    [stock] Searching Pexels: "${keywords}"`);

  // 1. Try video
  const videoOk = await fetchPexelsVideo(keywords, durationS, outputPath);
  if (videoOk) {
    console.log(`    [stock] ✅ Pexels video: "${keywords}" (~$0.00)`);
    return true;
  }

  // 2. Fallback: photo → Ken Burns
  const photoOk = await fetchPexelsPhoto(keywords, durationS, outputPath);
  if (photoOk) {
    console.log(`    [stock] ✅ Pexels photo→video: "${keywords}" (~$0.00)`);
    return true;
  }

  console.log(`    [stock] ❌ No match for "${keywords}" — falling back to AI`);
  return false;
}
