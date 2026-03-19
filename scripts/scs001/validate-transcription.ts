#!/usr/bin/env ts-node
/**
 * Sprint 248 Validation — Audio Transcription Module
 * Checks: module loads, types export, dry-run works, clip-detection has transcript fields
 */

import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); failed++; }
}

async function main() {
  console.log("\n=== Sprint 248 Validation — Audio Transcription ===\n");

  // 1. Module loads
  let transcribeModule: any;
  try {
    transcribeModule = await import("./transcribe-audio");
    assert("transcribe-audio module loads", true);
  } catch (e: any) {
    assert("transcribe-audio module loads", false, e.message);
    process.exit(1);
  }

  // 2. Key exports exist
  assert("transcribeClip function exported", typeof transcribeModule.transcribeClip === "function");
  assert("transcribeBatch function exported", typeof transcribeModule.transcribeBatch === "function");
  assert("extractAudio function exported", typeof transcribeModule.extractAudio === "function");
  assert("transcribeWithWhisper function exported", typeof transcribeModule.transcribeWithWhisper === "function");

  // 3. Dry run works
  try {
    const result = await transcribeModule.transcribeClip(
      join(ROOT, "scripts/scs001/transcribe-audio.ts"), // use any file as input
      "test-dry-run",
      join(ROOT, "workspace/scs001/transcripts"),
      true // dry-run
    );
    assert("Dry run produces TranscriptResult", result && result.clip_id === "test-dry-run");
    assert("Dry run text is placeholder", result.text.includes("DRY RUN"));
    assert("Dry run cost is 0", result.cost_usd === 0);
  } catch (e: any) {
    assert("Dry run works", false, e.message);
  }

  // 4. Transcripts directory exists
  assert("Transcripts directory exists", existsSync(join(ROOT, "workspace/scs001/transcripts")));

  // 5. ClipQualityScore has transcript fields — check source file for field declarations
  const clipDetSrc = require("fs").readFileSync(join(ROOT, "agents/scs001-clip-detection/index.ts"), "utf8");
  assert("ClipQualityScore has transcript field", clipDetSrc.includes("transcript?:"));
  assert("ClipQualityScore has transcript_path field", clipDetSrc.includes("transcript_path?:"));

  // 6. Batch with empty dir returns empty array
  try {
    const results = await transcribeModule.transcribeBatch(
      join(ROOT, "workspace/scs001/transcripts"), // empty dir
      join(ROOT, "workspace/scs001/transcripts"),
      true
    );
    assert("Batch on empty dir returns empty array", Array.isArray(results) && results.length === 0);
  } catch (e: any) {
    assert("Batch on empty dir", false, e.message);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
