#!/usr/bin/env ts-node
/**
 * Sprint 251 Validation — Avatar Presenter
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
  console.log("\n=== Sprint 251 Validation — Avatar Presenter ===\n");

  // 1. Module loads
  let avatar: any;
  try {
    avatar = await import("./avatar-presenter");
    assert("avatar-presenter module loads", true);
  } catch (e: any) {
    assert("avatar-presenter module loads", false, e.message);
    process.exit(1);
  }

  // 2. Exports
  assert("generateAvatarSegments exported", typeof avatar.generateAvatarSegments === "function");
  assert("isAvatarAvailable exported", typeof avatar.isAvatarAvailable === "function");

  // 3. Avatar availability check
  const avail = avatar.isAvatarAvailable();
  assert("isAvatarAvailable returns object", avail && "enabled" in avail && "reason" in avail);
  // Should be disabled since env vars not set
  assert("Avatar disabled without env vars", avail.enabled === false);

  // 4. Dry run with mock bundle
  const mockBundle = {
    script_id: "test-avatar-001",
    insight_id: "insight-001",
    clip_id: "clip-001",
    segments: [
      { segment_name: "hook", start_s: 0, end_s: 2, voiceover_text: "This changes everything", visual_directive: "title_card", caption_text: "Test" },
      { segment_name: "context", start_s: 2, end_s: 5, voiceover_text: "Here is what happened", visual_directive: "text_overlay", caption_text: "Test" },
      { segment_name: "clip", start_s: 5, end_s: 12, voiceover_text: "", visual_directive: "source_clip", caption_text: "" },
      { segment_name: "commentary", start_s: 12, end_s: 18, voiceover_text: "That was remarkable", visual_directive: "text_overlay", caption_text: "Test" },
      { segment_name: "insight", start_s: 18, end_s: 24, voiceover_text: "The takeaway is clear", visual_directive: "text_overlay", caption_text: "Test" },
    ],
    pattern_interrupts: [],
    total_duration_seconds: 24,
    loop_ending: false,
    why_does_this_matter: "Test",
    speaker_name: "Test Speaker",
    hook_formula_used: "curiosity_gap",
  };

  try {
    const result = await avatar.generateAvatarSegments(
      mockBundle,
      undefined,
      undefined,
      join(ROOT, "workspace/scs001/avatar-segments"),
      true // dry-run
    );
    assert("Dry run produces AvatarResult", result && "script_id" in result);
    assert("Dry run has 5 segments", result.segments.length === 5);
    const avatarSegs = result.segments.filter((s: any) => s.avatar_used);
    assert("4 avatar segments (not clip)", avatarSegs.length === 4);
    const clipSeg = result.segments.find((s: any) => s.segment_name === "clip");
    assert("Clip segment has no avatar", clipSeg && !clipSeg.avatar_used);
    assert("Dry run total cost > 0", result.total_cost_usd > 0);
  } catch (e: any) {
    assert("Dry run works", false, e.message);
  }

  // 5. EditedVideo interface has avatar fields
  const editSrc = require("fs").readFileSync(join(ROOT, "agents/scs001-editing/index.ts"), "utf8");
  assert("EditedVideo has avatar_segments field", editSrc.includes("avatar_segments?:"));
  assert("EditedVideo has has_voiceover field", editSrc.includes("has_voiceover?:"));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
