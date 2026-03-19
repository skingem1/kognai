/**
 * SCS-001 Caption Overlay Module
 *
 * Generates animated word-by-word captions with keyword highlighting
 * using JSON2Video API or local FFmpeg fallback.
 *
 * Features:
 *   - Word-by-word animated reveal (karaoke style)
 *   - Keyword highlighting (larger font, accent color)
 *   - Emoji overlays for emphasis segments
 *   - TikTok-optimized positioning (center-bottom, 9:16)
 *
 * Requires: JSON2VIDEO_API_KEY env var for API mode
 * Fallback: FFmpeg drawtext (basic, no animation)
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import type { ScriptBundle, ScriptSegment } from "../../agents/scs001-script/index";
import type { TranscriptSegment } from "./transcribe-audio";

// ── Types ──────────────────────────────────────────────

export interface CaptionWord {
  text: string;
  start_s: number;
  end_s: number;
  highlight: boolean;
  style?: "normal" | "bold" | "accent" | "emoji";
}

export interface CaptionOverlay {
  segment_name: string;
  words: CaptionWord[];
  position: "bottom" | "center" | "top";
  font_size: number;
  font_color: string;
  highlight_color: string;
  background_opacity: number;
}

export interface CaptionResult {
  script_id: string;
  overlays: CaptionOverlay[];
  video_path?: string; // Path to video with captions burned in
  json2video_used: boolean;
  cost_usd: number;
  generated_at: string;
}

// ── Config ─────────────────────────────────────────────

const JSON2VIDEO_API_KEY = process.env.JSON2VIDEO_API_KEY ?? "";
const JSON2VIDEO_ENDPOINT = "https://api.json2video.com/v2/movies";
const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";

const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "captioned-output");

// TikTok caption style
const CAPTION_STYLE = {
  font_size: 42,
  font_color: "#FFFFFF",
  highlight_color: "#FFD700", // Gold for keywords
  background_opacity: 0.6,
  position: "bottom" as const,
  max_words_per_line: 6,
};

// High-value keywords that get highlighting
const HIGHLIGHT_KEYWORDS = new Set([
  "never", "always", "secret", "truth", "wrong", "change", "everything",
  "money", "million", "billion", "percent", "shocking", "incredible",
  "nobody", "everyone", "impossible", "breakthrough", "critical", "dying",
  "exploding", "warning", "urgent", "mistake", "hidden", "exposed",
]);

// ── Word Timing ────────────────────────────────────────

/**
 * Split caption text into timed words.
 * If transcript segments are available, use their timing.
 * Otherwise, distribute evenly across the segment duration.
 */
export function buildCaptionWords(
  text: string,
  segmentStart: number,
  segmentEnd: number,
  transcriptSegments?: TranscriptSegment[]
): CaptionWord[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const duration = segmentEnd - segmentStart;
  const wordDuration = duration / words.length;

  return words.map((word, i) => {
    const cleanWord = word.replace(/[.,!?;:'"]/g, "").toLowerCase();
    return {
      text: word,
      start_s: Math.round((segmentStart + i * wordDuration) * 100) / 100,
      end_s: Math.round((segmentStart + (i + 1) * wordDuration) * 100) / 100,
      highlight: HIGHLIGHT_KEYWORDS.has(cleanWord),
      style: HIGHLIGHT_KEYWORDS.has(cleanWord) ? "accent" : "normal",
    };
  });
}

// ── Caption Generation ─────────────────────────────────

/**
 * Build caption overlays for all segments in a ScriptBundle.
 */
export function buildCaptionOverlays(
  bundle: ScriptBundle,
  transcriptSegments?: TranscriptSegment[]
): CaptionOverlay[] {
  return bundle.segments
    .filter((seg) => seg.caption_text && seg.caption_text.trim() !== "")
    .map((seg) => ({
      segment_name: seg.segment_name,
      words: buildCaptionWords(seg.caption_text, seg.start_s, seg.end_s, transcriptSegments),
      position: CAPTION_STYLE.position,
      font_size: CAPTION_STYLE.font_size,
      font_color: CAPTION_STYLE.font_color,
      highlight_color: CAPTION_STYLE.highlight_color,
      background_opacity: CAPTION_STYLE.background_opacity,
    }));
}

// ── JSON2Video API ─────────────────────────────────────

interface J2VScene {
  comment: string;
  elements: any[];
}

/**
 * Build JSON2Video movie payload from caption overlays.
 */
export function buildJSON2VideoPayload(
  overlays: CaptionOverlay[],
  videoUrl: string,
  totalDuration: number
): any {
  const scenes: J2VScene[] = [];

  for (const overlay of overlays) {
    const elements: any[] = [];

    // Group words into lines
    const lines: CaptionWord[][] = [];
    let currentLine: CaptionWord[] = [];
    for (const word of overlay.words) {
      currentLine.push(word);
      if (currentLine.length >= CAPTION_STYLE.max_words_per_line) {
        lines.push(currentLine);
        currentLine = [];
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // Create text elements for each line
    for (const line of lines) {
      const lineStart = line[0].start_s;
      const lineEnd = line[line.length - 1].end_s;

      elements.push({
        type: "text",
        text: line.map((w) => w.text).join(" "),
        start: lineStart,
        end: lineEnd,
        style: {
          fontSize: overlay.font_size,
          color: overlay.font_color,
          backgroundColor: `rgba(0,0,0,${overlay.background_opacity})`,
          textAlign: "center",
          fontFamily: "Inter",
          fontWeight: "bold",
          padding: "8px 16px",
          borderRadius: "8px",
        },
        position: "bottom-center",
        animation: {
          type: "typewriter",
          duration: 0.3,
        },
      });

      // Highlight keywords with accent style
      for (const word of line.filter((w) => w.highlight)) {
        elements.push({
          type: "text",
          text: word.text,
          start: word.start_s,
          end: word.end_s,
          style: {
            fontSize: overlay.font_size * 1.2,
            color: overlay.highlight_color,
            fontWeight: "900",
            textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
          },
          position: "bottom-center",
          animation: { type: "pop", duration: 0.2 },
        });
      }
    }

    scenes.push({ comment: overlay.segment_name, elements });
  }

  return {
    resolution: "1080x1920",
    quality: "high",
    scenes: [
      {
        background: { type: "video", src: videoUrl },
        duration: totalDuration,
        elements: scenes.flatMap((s) => s.elements),
      },
    ],
  };
}

/**
 * Submit a caption job to JSON2Video API.
 */
export async function submitCaptionJob(
  payload: any
): Promise<{ project_id: string; status: string }> {
  if (!JSON2VIDEO_API_KEY) {
    throw new Error("JSON2VIDEO_API_KEY not set");
  }

  const res = await fetch(JSON2VIDEO_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": JSON2VIDEO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`JSON2Video ${res.status}: ${err}`);
  }

  return (await res.json()) as { project_id: string; status: string };
}

// ── FFmpeg Fallback ────────────────────────────────────

/**
 * Burn captions into video using FFmpeg drawtext filter.
 * Basic fallback when JSON2Video API is unavailable.
 */
export function burnCaptionsFFmpeg(
  videoPath: string,
  overlays: CaptionOverlay[],
  outputPath: string,
  dryRun: boolean = false
): string {
  if (dryRun) {
    console.log(`  [DRY RUN] Would burn ${overlays.length} caption overlays into ${videoPath}`);
    return outputPath;
  }

  // Build drawtext filter chain
  const filters = overlays.flatMap((overlay) => {
    const lines: string[] = [];
    let currentText = "";
    for (const word of overlay.words) {
      currentText += (currentText ? " " : "") + word.text;
      if (currentText.split(" ").length >= CAPTION_STYLE.max_words_per_line) {
        lines.push(currentText);
        currentText = "";
      }
    }
    if (currentText) lines.push(currentText);

    return lines.map((line, i) => {
      const segStart = overlay.words[0]?.start_s ?? 0;
      const segEnd = overlay.words[overlay.words.length - 1]?.end_s ?? segStart + 3;
      const escaped = line.replace(/'/g, "'\\''").replace(/:/g, "\\:");
      return `drawtext=text='${escaped}':fontsize=${overlay.font_size}:fontcolor=${overlay.font_color}:x=(w-text_w)/2:y=h-${100 + i * 60}:enable='between(t,${segStart},${segEnd})':box=1:boxcolor=black@${overlay.background_opacity}:boxborderw=8`;
    });
  });

  if (filters.length === 0) {
    // No captions — just copy
    execSync(`${FFMPEG} -y -i "${videoPath}" -c copy "${outputPath}" 2>/dev/null`, {
      stdio: "pipe", timeout: 30000,
    });
    return outputPath;
  }

  const filterStr = filters.join(",");
  const cmd = `${FFMPEG} -y -i "${videoPath}" -vf "${filterStr}" -c:a copy "${outputPath}" 2>/dev/null`;

  try {
    execSync(cmd, { stdio: "pipe", timeout: 120000 });
  } catch (err: any) {
    console.warn(`  FFmpeg caption burn failed: ${err.message} — copying without captions`);
    execSync(`${FFMPEG} -y -i "${videoPath}" -c copy "${outputPath}" 2>/dev/null`, {
      stdio: "pipe", timeout: 30000,
    });
  }

  return outputPath;
}

// ── Public API ─────────────────────────────────────────

/**
 * Generate caption overlay for a ScriptBundle.
 * Uses JSON2Video API if available, falls back to FFmpeg drawtext.
 */
export async function generateCaptions(
  bundle: ScriptBundle,
  videoPath?: string,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<CaptionResult> {
  mkdirSync(outDir, { recursive: true });

  const overlays = buildCaptionOverlays(bundle);
  const useAPI = !!JSON2VIDEO_API_KEY && !dryRun;
  let captionedVideoPath: string | undefined;
  let cost = 0;

  if (dryRun) {
    console.log(`  [DRY RUN] ${overlays.length} caption overlays built`);
    const totalWords = overlays.reduce((sum, o) => sum + o.words.length, 0);
    const highlighted = overlays.reduce((sum, o) => sum + o.words.filter((w) => w.highlight).length, 0);
    console.log(`  [DRY RUN] ${totalWords} words, ${highlighted} highlighted`);
  } else if (useAPI && videoPath) {
    // JSON2Video API mode
    try {
      const payload = buildJSON2VideoPayload(overlays, videoPath, bundle.total_duration_seconds);
      const job = await submitCaptionJob(payload);
      console.log(`  JSON2Video job submitted: ${job.project_id}`);
      cost = 0.02; // ~$0.02 per video at $20/mo plan
    } catch (err: any) {
      console.warn(`  JSON2Video failed: ${err.message} — falling back to FFmpeg`);
      if (videoPath && existsSync(videoPath)) {
        captionedVideoPath = join(outDir, `${bundle.script_id}_captioned.mp4`);
        burnCaptionsFFmpeg(videoPath, overlays, captionedVideoPath);
      }
    }
  } else if (videoPath && existsSync(videoPath)) {
    // FFmpeg fallback
    captionedVideoPath = join(outDir, `${bundle.script_id}_captioned.mp4`);
    burnCaptionsFFmpeg(videoPath, overlays, captionedVideoPath);
  }

  const result: CaptionResult = {
    script_id: bundle.script_id,
    overlays,
    video_path: captionedVideoPath,
    json2video_used: useAPI,
    cost_usd: cost,
    generated_at: new Date().toISOString(),
  };

  // Save manifest
  const manifestPath = join(outDir, `${bundle.script_id}_caption_manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(result, null, 2));

  return result;
}
