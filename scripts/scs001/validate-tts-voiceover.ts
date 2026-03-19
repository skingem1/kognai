#!/usr/bin/env ts-node
/**
 * Sprint 250 Validation — TTS Voiceover + Audio Mixer
 */

import { join } from "path";

const ROOT = join(__dirname, "..", "..");
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); failed++; }
}

async function main() {
  console.log("\n=== Sprint 250 Validation — TTS Voiceover + Audio Mixer ===\n");

  // 1. TTS module loads
  let tts: any;
  try {
    tts = await import("./tts-voiceover");
    assert("tts-voiceover module loads", true);
  } catch (e: any) {
    assert("tts-voiceover module loads", false, e.message);
    process.exit(1);
  }

  // 2. TTS exports
  assert("generateVoiceover exported", typeof tts.generateVoiceover === "function");
  assert("generateVoiceovers exported", typeof tts.generateVoiceovers === "function");

  // 3. Audio mixer loads
  let mixer: any;
  try {
    mixer = await import("./audio-mixer");
    assert("audio-mixer module loads", true);
  } catch (e: any) {
    assert("audio-mixer module loads", false, e.message);
  }

  // 4. Mixer exports
  if (mixer) {
    assert("mixAudio exported", typeof mixer.mixAudio === "function");
    assert("concatVoiceover exported", typeof mixer.concatVoiceover === "function");
  }

  // 5. Dry run TTS with mock bundle
  const mockBundle = {
    script_id: "test-tts-001",
    insight_id: "insight-001",
    clip_id: "clip-001",
    segments: [
      { segment_name: "hook", start_s: 0, end_s: 2, voiceover_text: "This will change everything", visual_directive: "title_card", caption_text: "Test" },
      { segment_name: "context", start_s: 2, end_s: 5, voiceover_text: "Here's what you need to know", visual_directive: "text_overlay", caption_text: "Test" },
      { segment_name: "clip", start_s: 5, end_s: 12, voiceover_text: "", visual_directive: "source_clip", caption_text: "" },
      { segment_name: "commentary", start_s: 12, end_s: 18, voiceover_text: "That was incredible insight", visual_directive: "text_overlay", caption_text: "Test" },
      { segment_name: "insight", start_s: 18, end_s: 24, voiceover_text: "The key takeaway is clear", visual_directive: "text_overlay", caption_text: "Test" },
    ],
    pattern_interrupts: [],
    total_duration_seconds: 24,
    loop_ending: false,
    why_does_this_matter: "Test",
    speaker_name: "Test Speaker",
    hook_formula_used: "curiosity_gap",
  };

  try {
    const result = await tts.generateVoiceover(mockBundle, join(ROOT, "workspace/scs001/voiceover-audio"), true);
    assert("TTS dry run produces VoiceoverResult", result && "script_id" in result);
    assert("TTS dry run has 4 segments (skip clip)", result.segments.length === 4);
    assert("TTS dry run cost > 0", result.total_cost_usd > 0);
    assert("TTS dry run voice_id is Sarah", result.voice_id === "EXAVITQu4vr4xnSDxMaL");
  } catch (e: any) {
    assert("TTS dry run", false, e.message);
  }

  // 6. Dry run mixer
  if (mixer) {
    try {
      const mockVoiceover = { script_id: "test-001", segments: [], total_cost_usd: 0, total_duration_s: 0, voice_id: "test", model_id: "test", generated_at: "" };
      const result = mixer.mixAudio({
        voiceover: mockVoiceover,
        bundle: mockBundle,
        videoPath: "/tmp/nonexistent.mp4",
      }, true);
      assert("Mixer dry run produces MixResult", result && "output_path" in result);
      assert("Mixer dry run has correct script_id", result.script_id === "test-tts-001");
    } catch (e: any) {
      assert("Mixer dry run", false, e.message);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
