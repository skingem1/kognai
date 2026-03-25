/**
 * SCS-001 Avatar Presenter Module
 *
 * Generates AI avatar video segments using Captions.ai API.
 * The avatar speaks voiceover_text with lip-sync for non-clip segments.
 * Clip segment retains original source video.
 *
 * API: Captions.ai (or compatible avatar generation API)
 * Requires: CAPTIONS_API_KEY env var
 *
 * Premium tier feature — disabled by default.
 * Enable: AVATAR_ENABLED=1
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { dirname } from "path";
import { join } from "path";
import type { ScriptBundle, ScriptSegment } from "../../agents/scs001-script/index";
import type { VoiceoverResult } from "./tts-voiceover";

// ── Types ──────────────────────────────────────────────

export interface AvatarConfig {
  avatar_id?: string;
  background?: "transparent" | "studio" | "custom";
  background_color?: string;
  resolution?: "720p" | "1080p";
  aspect_ratio?: "9:16" | "16:9" | "1:1";
  voice_id?: string; // If set, uses Captions.ai built-in TTS instead of external voiceover
}

export interface AvatarSegmentResult {
  segment_name: string;
  video_path: string;
  duration_s: number;
  text: string;
  avatar_used: boolean;
  cost_usd: number;
}

export interface AvatarResult {
  script_id: string;
  segments: AvatarSegmentResult[];
  total_cost_usd: number;
  avatar_config: AvatarConfig;
  generated_at: string;
}

// ── Config ─────────────────────────────────────────────

const CAPTIONS_API_KEY = process.env.CAPTIONS_API_KEY ?? "";
const AVATAR_ENABLED = process.env.AVATAR_ENABLED === "1" || process.env.AVATAR_ENABLED === "true";
const CAPTIONS_API_BASE = process.env.CAPTIONS_API_BASE ?? "https://api.captions.ai/api/creator";

const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "avatar-segments");

// Default avatar config — TikTok vertical format
const DEFAULT_CONFIG: AvatarConfig = {
  avatar_id: "default",
  background: "studio",
  resolution: "1080p",
  aspect_ratio: "9:16",
};

// Segments that get avatar treatment (not the clip — that's real video)
const AVATAR_SEGMENTS = new Set(["hook", "context", "commentary", "insight", "loop"]);

// Captions.ai pricing estimate: ~$0.05 per segment at Max plan ($57/mo)
const COST_PER_SEGMENT = 0.05;

// ── API Client ─────────────────────────────────────────

interface CaptionsJobResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  video_url?: string;
  error?: string;
}

// Default avatar creator — available: Jason, Kate, Jake, Kira, Luke, Selene, Ethan, Liam
const DEFAULT_CREATOR = process.env.CAPTIONS_CREATOR ?? "Jason";

/**
 * Generate a standalone avatar video from text using Captions.ai.
 * Uses the correct /submit + /poll endpoints (confirmed working 2026-03-23).
 * Returns the downloaded MP4 path.
 */
export async function generateAvatarVideo(
  script: string,
  outPath: string,
  creatorName: string = DEFAULT_CREATOR,
  maxWaitMs: number = 600000, // 10 min (was 5 min — Captions.ai can be slow)
): Promise<{ path: string; cost_credits: number }> {
  if (!CAPTIONS_API_KEY) throw new Error("CAPTIONS_API_KEY not set");

  // Captions.ai limit: 800 chars per script
  const truncated = script.slice(0, 800);
  mkdirSync(dirname(outPath), { recursive: true });

  // Step 1: Submit
  const submitRes = await fetch(`${CAPTIONS_API_BASE}/submit`, {
    method: "POST",
    headers: {
      "x-api-key": CAPTIONS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ creatorName, script: truncated }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Captions.ai submit ${submitRes.status}: ${err}`);
  }
  const { operationId } = (await submitRes.json()) as { operationId: string };
  if (!operationId) throw new Error("Captions.ai: no operationId in response");

  console.log(`  [Captions.ai] Job ${operationId} submitted (creator: ${creatorName})`);

  // Step 2: Poll until COMPLETE
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 10000)); // 10s intervals

    const pollRes = await fetch(`${CAPTIONS_API_BASE}/poll`, {
      method: "POST",
      headers: {
        "x-api-key": CAPTIONS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operationId }),
    });
    if (!pollRes.ok) throw new Error(`Captions.ai poll ${pollRes.status}`);

    const pollData = (await pollRes.json()) as { state: string; url?: string; progress?: number };

    if (pollData.state === "COMPLETE" && pollData.url) {
      // Step 3: Download
      const dlRes = await fetch(pollData.url);
      if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      writeFileSync(outPath, buffer);

      // Estimate credits: ~1 credit per second of video
      const costCredits = Math.ceil(truncated.length / 130); // rough: 130 chars ≈ 1s
      console.log(`  [Captions.ai] ✅ Avatar downloaded: ${outPath} (~${costCredits} credits)`);
      return { path: outPath, cost_credits: costCredits };
    }

    if (pollData.state === "FAILED") {
      throw new Error("Captions.ai job FAILED");
    }

    console.log(`  [Captions.ai] ${pollData.state} (${pollData.progress ?? '?'}%)...`);
  }

  throw new Error(`Captions.ai timeout after ${maxWaitMs / 1000}s`);
}


async function createAvatarJob(
  text: string,
  config: AvatarConfig,
  voiceoverPath?: string
): Promise<CaptionsJobResponse> {
  if (!CAPTIONS_API_KEY) {
    throw new Error("CAPTIONS_API_KEY not set");
  }

  const payload: any = {
    text,
    avatar_id: config.avatar_id,
    background: config.background,
    resolution: config.resolution,
    aspect_ratio: config.aspect_ratio,
  };

  // If external voiceover audio exists, use it for lip-sync
  if (voiceoverPath && existsSync(voiceoverPath)) {
    const audioBuffer = readFileSync(voiceoverPath);
    payload.audio_base64 = audioBuffer.toString("base64");
    payload.lip_sync_mode = "audio";
  } else {
    payload.lip_sync_mode = "text";
    if (config.voice_id) payload.voice_id = config.voice_id;
  }

  const res = await fetch(`${CAPTIONS_API_BASE}/avatarVideoFromUrl`, {
    method: "POST",
    headers: {
      "x-api-key": CAPTIONS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Captions.ai ${res.status}: ${err}`);
  }

  return (await res.json()) as CaptionsJobResponse;
}

async function pollJobStatus(jobId: string, maxWaitMs: number = 120000): Promise<CaptionsJobResponse> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${CAPTIONS_API_BASE}/jobs/${jobId}`, {
      headers: { "x-api-key": CAPTIONS_API_KEY },
    });

    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
    const data = (await res.json()) as CaptionsJobResponse;

    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(`Job failed: ${data.error}`);

    // Wait 3 seconds before polling again
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Job ${jobId} timed out after ${maxWaitMs}ms`);
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);
}

// ── Avatar Generator ───────────────────────────────────

/**
 * Generate avatar video segments for a ScriptBundle.
 * Only generates for non-clip segments (hook, context, commentary, insight, loop).
 */
export async function generateAvatarSegments(
  bundle: ScriptBundle,
  config: AvatarConfig = DEFAULT_CONFIG,
  voiceover?: VoiceoverResult,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<AvatarResult> {
  mkdirSync(outDir, { recursive: true });

  const segments: AvatarSegmentResult[] = [];
  let totalCost = 0;

  for (const seg of bundle.segments) {
    if (!AVATAR_SEGMENTS.has(seg.segment_name)) {
      // Clip segment — no avatar
      segments.push({
        segment_name: seg.segment_name,
        video_path: "",
        duration_s: seg.end_s - seg.start_s,
        text: seg.voiceover_text,
        avatar_used: false,
        cost_usd: 0,
      });
      continue;
    }

    if (!seg.voiceover_text || seg.voiceover_text.trim() === "") {
      segments.push({
        segment_name: seg.segment_name,
        video_path: "",
        duration_s: seg.end_s - seg.start_s,
        text: "",
        avatar_used: false,
        cost_usd: 0,
      });
      continue;
    }

    const filename = `${bundle.script_id}_${seg.segment_name}_avatar.mp4`;
    const videoPath = join(outDir, filename);

    if (dryRun) {
      segments.push({
        segment_name: seg.segment_name,
        video_path: videoPath,
        duration_s: seg.end_s - seg.start_s,
        text: seg.voiceover_text,
        avatar_used: true,
        cost_usd: COST_PER_SEGMENT,
      });
      totalCost += COST_PER_SEGMENT;
      console.log(`  [DRY RUN] ${seg.segment_name}: avatar → ${filename}`);
      continue;
    }

    try {
      // Sprint 1362: Use /submit + /poll endpoints (confirmed working) instead of
      // /avatarVideoFromUrl which returns 404. generateAvatarVideo handles the full
      // submit → poll → download cycle using the working API pattern.
      console.log(`  Generating avatar for ${seg.segment_name}...`);
      await generateAvatarVideo(seg.voiceover_text, videoPath, DEFAULT_CREATOR);

      segments.push({
        segment_name: seg.segment_name,
        video_path: videoPath,
        duration_s: seg.end_s - seg.start_s,
        text: seg.voiceover_text,
        avatar_used: true,
        cost_usd: COST_PER_SEGMENT,
      });
      totalCost += COST_PER_SEGMENT;
    } catch (err: any) {
      console.warn(`  Avatar failed for ${seg.segment_name}: ${err.message}`);
      segments.push({
        segment_name: seg.segment_name,
        video_path: "",
        duration_s: seg.end_s - seg.start_s,
        text: seg.voiceover_text,
        avatar_used: false,
        cost_usd: 0,
      });
    }
  }

  const result: AvatarResult = {
    script_id: bundle.script_id,
    segments,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    avatar_config: config,
    generated_at: new Date().toISOString(),
  };

  // Save manifest
  const manifestPath = join(outDir, `${bundle.script_id}_avatar_manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(result, null, 2));

  return result;
}

/**
 * Check if avatar feature is enabled and API key is set.
 */
export function isAvatarAvailable(): { enabled: boolean; reason: string } {
  if (!AVATAR_ENABLED) return { enabled: false, reason: "AVATAR_ENABLED not set" };
  if (!CAPTIONS_API_KEY) return { enabled: false, reason: "CAPTIONS_API_KEY not set" };
  return { enabled: true, reason: "Ready" };
}
