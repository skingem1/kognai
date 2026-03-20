/**
 * SCS-001 Local TTS Module — Zero-Cost Voiceover
 *
 * Uses macOS `say` command for text-to-speech, then FFmpeg to convert
 * AIFF → MP3. Produces same VoiceoverResult interface as ElevenLabs module.
 *
 * Voice: Samantha (en_US) — natural female voice, good for content narration
 * Cost: $0.00 (local, no API)
 *
 * Requires: macOS with `say` command + FFmpeg installed
 * Fallback: if `say` unavailable, generates silent audio of estimated duration
 */

import { execSync } from "child_process";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import type { ScriptBundle } from "../../agents/scs001-script/index";
import type { VoiceoverSegment, VoiceoverResult } from "./tts-voiceover";

// ── Config ─────────────────────────────────────────────

const VOICE = process.env.LOCAL_TTS_VOICE ?? "Samantha";
const RATE = parseInt(process.env.LOCAL_TTS_RATE ?? "175", 10); // words per minute
const ROOT = join(__dirname, "..", "..");
const DEFAULT_OUT_DIR = join(ROOT, "workspace", "scs001", "voiceover-audio");

// ── Helpers ────────────────────────────────────────────

function sayAvailable(): boolean {
  try {
    execSync("which say", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function ffmpegAvailable(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function getAudioDuration(path: string): number {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
      { stdio: "pipe" }
    ).toString().trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

function sanitizeText(text: string): string {
  // Remove characters that break shell quoting
  return text.replace(/['"\\`$]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Local TTS Generation ──────────────────────────────

function generateLocalVoice(
  text: string,
  outputPath: string
): { duration_s: number } {
  const hasSay = sayAvailable();
  const hasFFmpeg = ffmpegAvailable();

  if (!hasSay || !hasFFmpeg) {
    // Generate silent audio as fallback
    const estDuration = (text.split(/\s+/).length / (RATE / 60));
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${estDuration.toFixed(1)} "${outputPath}"`,
      { stdio: "pipe" }
    );
    return { duration_s: estDuration };
  }

  const aiffPath = outputPath.replace(/\.mp3$/, ".aiff");
  const sanitized = sanitizeText(text);

  // Generate AIFF with macOS say
  execSync(
    `say -v "${VOICE}" -r ${RATE} -o "${aiffPath}" "${sanitized}"`,
    { stdio: "pipe", timeout: 30000 }
  );

  // Convert AIFF → MP3 via FFmpeg
  execSync(
    `ffmpeg -y -i "${aiffPath}" -acodec libmp3lame -ab 128k -ar 44100 "${outputPath}"`,
    { stdio: "pipe", timeout: 30000 }
  );

  // Get actual duration
  const duration_s = getAudioDuration(outputPath);

  // Clean up AIFF
  if (existsSync(aiffPath)) {
    try { unlinkSync(aiffPath); } catch { /* ignore */ }
  }

  return { duration_s };
}

// ── Public API ─────────────────────────────────────────

/**
 * Generate voiceover for a single ScriptBundle using local TTS.
 * Same interface as ElevenLabs generateVoiceover().
 */
export async function generateLocalVoiceover(
  bundle: ScriptBundle,
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<VoiceoverResult> {
  mkdirSync(outDir, { recursive: true });

  const segments: VoiceoverSegment[] = [];
  let totalDuration = 0;

  for (const seg of bundle.segments) {
    if (!seg.voiceover_text || seg.voiceover_text.trim() === "") {
      continue;
    }

    const filename = `${bundle.script_id}_${seg.segment_name}.mp3`;
    const audioPath = join(outDir, filename);

    if (dryRun) {
      const wordCount = seg.voiceover_text.split(/\s+/).length;
      const estDuration = (wordCount / RATE) * 60;
      segments.push({
        segment_name: seg.segment_name,
        audio_path: audioPath,
        duration_s: Math.round(estDuration * 10) / 10,
        text: seg.voiceover_text,
        cost_usd: 0,
      });
      totalDuration += estDuration;
      console.log(`  [DRY RUN] [LOCAL] ${seg.segment_name}: "${seg.voiceover_text.substring(0, 50)}..." → ${filename}`);
      continue;
    }

    try {
      console.log(`  [LOCAL TTS] ${seg.segment_name}: "${seg.voiceover_text.substring(0, 50)}..."`);
      const result = generateLocalVoice(seg.voiceover_text, audioPath);
      segments.push({
        segment_name: seg.segment_name,
        audio_path: audioPath,
        duration_s: result.duration_s,
        text: seg.voiceover_text,
        cost_usd: 0,
      });
      totalDuration += result.duration_s;
    } catch (err: any) {
      console.warn(`  Failed ${seg.segment_name}: ${err.message}`);
    }
  }

  return {
    script_id: bundle.script_id,
    segments,
    total_cost_usd: 0,
    total_duration_s: Math.round(totalDuration * 10) / 10,
    voice_id: `local-${VOICE}`,
    model_id: "macos-say",
    generated_at: new Date().toISOString(),
  };
}

/**
 * Batch generate voiceover for multiple ScriptBundles using local TTS.
 */
export async function generateLocalVoiceovers(
  bundles: ScriptBundle[],
  outDir: string = DEFAULT_OUT_DIR,
  dryRun: boolean = false
): Promise<VoiceoverResult[]> {
  const results: VoiceoverResult[] = [];
  for (const bundle of bundles) {
    console.log(`\n  [LOCAL TTS] Processing ${bundle.script_id} (${bundle.segments.length} segments)`);
    const result = await generateLocalVoiceover(bundle, outDir, dryRun);
    results.push(result);
  }
  return results;
}

/**
 * Check if local TTS is available on this machine.
 */
export function isLocalTTSAvailable(): boolean {
  return sayAvailable() && ffmpegAvailable();
}
