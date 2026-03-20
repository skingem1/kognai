/**
 * SCS-001 TTS Voiceover Module
 *
 * Generates per-segment voiceover audio using ElevenLabs API.
 * Each ScriptBundle segment with voiceover_text gets a .mp3 file.
 * Segments without voiceover (e.g., clip segment) are skipped.
 *
 * Requires: ELEVENLABS_API_KEY env var
 * Voice: Sarah (EXAVITQu4vr4xnSDxMaL) — professional, neutral, clear
 * Model: eleven_flash_v2_5 — fastest, lowest latency
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import type { ScriptBundle, ScriptSegment } from "../../agents/scs001-script/index";
import { generateLocalVoiceover, generateLocalVoiceovers, isLocalTTSAvailable } from "./tts-local";

// ── Types ──────────────────────────────────────────────

export interface VoiceoverSegment {
  segment_name: string;
  audio_path: string;
  duration_s: number;
  text: string;
  cost_usd: number;
}

export interface VoiceoverResult {
  script_id: string;
  segments: VoiceoverSegment[];
  total_cost_usd: number;
  total_duration_s: number;
  voice_id: string;
  model_id: string;
  generated_at: string;
}

// ── Config ─────────────────────────────────────────────

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE_ID = process.env.TTS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah
const MODEL_ID = process.env.TTS_MODEL_ID ?? "eleven_flash_v2_5";
const TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "voiceover-audio");

// ElevenLabs pricing: ~$0.30/1000 chars on starter plan
const COST_PER_CHAR = 0.0003;

// ── ElevenLabs API ─────────────────────────────────────

async function generateVoice(
  text: string,
  outputPath: string
): Promise<{ duration_s: number; cost_usd: number }> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not set");
  }

  const res = await fetch(`${TTS_ENDPOINT}/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);

  // Estimate duration: ~150 words/min, ~5 chars/word → ~750 chars/min
  const estimatedDuration = (text.length / 750) * 60;
  const cost = text.length * COST_PER_CHAR;

  return {
    duration_s: Math.round(estimatedDuration * 10) / 10,
    cost_usd: Math.round(cost * 1000000) / 1000000,
  };
}

// ── Voiceover Generator ────────────────────────────────

/**
 * Generate voiceover audio for all segments in a ScriptBundle.
 * Skips segments with empty voiceover_text (e.g., clip segment).
 */
export async function generateVoiceover(
  bundle: ScriptBundle,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<VoiceoverResult> {
  // Auto-fallback to local TTS when ElevenLabs key not set
  if (!ELEVENLABS_API_KEY && !dryRun) {
    if (isLocalTTSAvailable()) {
      console.log("  [TTS] ELEVENLABS_API_KEY not set — using local TTS (macOS say, $0.00)");
      return generateLocalVoiceover(bundle, outDir, false);
    }
    console.warn("  [TTS] No TTS available — ELEVENLABS_API_KEY not set and local TTS unavailable");
  }

  mkdirSync(outDir, { recursive: true });

  const segments: VoiceoverSegment[] = [];
  let totalCost = 0;
  let totalDuration = 0;

  for (const seg of bundle.segments) {
    if (!seg.voiceover_text || seg.voiceover_text.trim() === "") {
      continue; // Skip segments without voiceover (e.g., clip with original audio)
    }

    const filename = `${bundle.script_id}_${seg.segment_name}.mp3`;
    const audioPath = join(outDir, filename);

    if (dryRun) {
      const estDuration = (seg.voiceover_text.length / 750) * 60;
      const estCost = seg.voiceover_text.length * COST_PER_CHAR;
      segments.push({
        segment_name: seg.segment_name,
        audio_path: audioPath,
        duration_s: Math.round(estDuration * 10) / 10,
        text: seg.voiceover_text,
        cost_usd: Math.round(estCost * 1000000) / 1000000,
      });
      totalCost += estCost;
      totalDuration += estDuration;
      console.log(`  [DRY RUN] ${seg.segment_name}: "${seg.voiceover_text.substring(0, 50)}..." → ${filename}`);
      continue;
    }

    try {
      console.log(`  Generating ${seg.segment_name}: "${seg.voiceover_text.substring(0, 50)}..."`);
      const result = await generateVoice(seg.voiceover_text, audioPath);
      segments.push({
        segment_name: seg.segment_name,
        audio_path: audioPath,
        duration_s: result.duration_s,
        text: seg.voiceover_text,
        cost_usd: result.cost_usd,
      });
      totalCost += result.cost_usd;
      totalDuration += result.duration_s;
    } catch (err: any) {
      console.warn(`  Failed ${seg.segment_name}: ${err.message}`);
    }
  }

  return {
    script_id: bundle.script_id,
    segments,
    total_cost_usd: Math.round(totalCost * 1000000) / 1000000,
    total_duration_s: Math.round(totalDuration * 10) / 10,
    voice_id: VOICE_ID,
    model_id: MODEL_ID,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Batch generate voiceover for multiple ScriptBundles.
 */
export async function generateVoiceovers(
  bundles: ScriptBundle[],
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<VoiceoverResult[]> {
  // Auto-fallback to local TTS for batch too
  if (!ELEVENLABS_API_KEY && !dryRun && isLocalTTSAvailable()) {
    console.log("  [TTS] ELEVENLABS_API_KEY not set — batch using local TTS (macOS say, $0.00)");
    return generateLocalVoiceovers(bundles, outDir, false);
  }

  const results: VoiceoverResult[] = [];

  for (const bundle of bundles) {
    console.log(`\n  [TTS] Processing ${bundle.script_id} (${bundle.segments.length} segments)`);
    const result = await generateVoiceover(bundle, outDir, dryRun);
    results.push(result);

    // Save manifest
    const manifestPath = join(outDir, `${bundle.script_id}_manifest.json`);
    writeFileSync(manifestPath, JSON.stringify(result, null, 2));
  }

  return results;
}
