#!/usr/bin/env ts-node
/**
 * Sprint 252 Validation — Caption Overlay + Pattern Interrupts
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
  console.log("\n=== Sprint 252 Validation — Caption Overlay + Pattern Interrupts ===\n");

  // 1. Caption overlay loads
  let captions: any;
  try {
    captions = await import("./caption-overlay");
    assert("caption-overlay module loads", true);
  } catch (e: any) {
    assert("caption-overlay module loads", false, e.message);
    process.exit(1);
  }

  // 2. Caption exports
  assert("generateCaptions exported", typeof captions.generateCaptions === "function");
  assert("buildCaptionWords exported", typeof captions.buildCaptionWords === "function");
  assert("buildCaptionOverlays exported", typeof captions.buildCaptionOverlays === "function");
  assert("buildJSON2VideoPayload exported", typeof captions.buildJSON2VideoPayload === "function");
  assert("burnCaptionsFFmpeg exported", typeof captions.burnCaptionsFFmpeg === "function");

  // 3. Pattern interrupts loads
  let interrupts: any;
  try {
    interrupts = await import("./pattern-interrupts");
    assert("pattern-interrupts module loads", true);
  } catch (e: any) {
    assert("pattern-interrupts module loads", false, e.message);
  }

  // 4. Interrupt exports
  if (interrupts) {
    assert("buildInterruptFilter exported", typeof interrupts.buildInterruptFilter === "function");
    assert("buildAllInterruptFilters exported", typeof interrupts.buildAllInterruptFilters === "function");
    assert("buildFilterChain exported", typeof interrupts.buildFilterChain === "function");
    assert("applyInterrupts exported", typeof interrupts.applyInterrupts === "function");
  }

  // 5. Test buildCaptionWords
  const words = captions.buildCaptionWords("This changes everything forever", 0, 4);
  assert("buildCaptionWords returns words", words.length === 4);
  assert("'changes' is not highlighted (not in keyword set)", words[1]?.highlight === false);
  assert("'everything' is highlighted", words[2]?.highlight === true);
  assert("'This' is not highlighted", words[0]?.highlight === false);
  assert("Word timing is sequential", words[0].start_s < words[1].start_s);

  // 6. Test buildCaptionOverlays with mock bundle
  const mockBundle = {
    script_id: "test-cap-001",
    insight_id: "i-001",
    clip_id: "c-001",
    segments: [
      { segment_name: "hook", start_s: 0, end_s: 2, voiceover_text: "Hook text", visual_directive: "title_card", caption_text: "Nobody talks about this secret" },
      { segment_name: "clip", start_s: 5, end_s: 12, voiceover_text: "", visual_directive: "source_clip", caption_text: "" },
      { segment_name: "insight", start_s: 18, end_s: 24, voiceover_text: "Key insight", visual_directive: "text_overlay", caption_text: "The truth is shocking" },
    ],
    pattern_interrupts: [
      { time_s: 2.5, type: "cut" as const },
      { time_s: 5.0, type: "zoom" as const },
      { time_s: 7.5, type: "color_shift" as const },
      { time_s: 10.0, type: "text_pop" as const },
    ],
    total_duration_seconds: 24,
    loop_ending: false,
    why_does_this_matter: "Test",
    speaker_name: "Test",
    hook_formula_used: "secret",
  };

  const overlays = captions.buildCaptionOverlays(mockBundle);
  assert("buildCaptionOverlays returns 2 overlays (hook + insight, skip empty clip)", overlays.length === 2);

  // 7. Test interrupt filters
  if (interrupts) {
    const filters = interrupts.buildAllInterruptFilters(mockBundle.pattern_interrupts);
    assert("buildAllInterruptFilters returns filters", filters.length > 0);
    assert("text_pop excluded from filters", !filters.some((f: any) => f.type === "text_pop"));

    const chain = interrupts.buildFilterChain(mockBundle.pattern_interrupts);
    assert("buildFilterChain returns string", typeof chain === "string" && chain.length > 0);
    assert("Filter chain excludes zoompan", !chain.includes("zoompan"));
  }

  // 8. Dry run generateCaptions
  try {
    const result = await captions.generateCaptions(mockBundle, undefined, join(ROOT, "workspace/scs001/captioned-output"), true);
    assert("Dry run produces CaptionResult", result && "overlays" in result);
    assert("Dry run has overlays", result.overlays.length > 0);
  } catch (e: any) {
    assert("Dry run generateCaptions", false, e.message);
  }

  // 9. Dry run applyInterrupts
  if (interrupts) {
    const out = interrupts.applyInterrupts("/tmp/test.mp4", mockBundle.pattern_interrupts, "/tmp/out.mp4", true);
    assert("Dry run applyInterrupts returns path", typeof out === "string");
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
