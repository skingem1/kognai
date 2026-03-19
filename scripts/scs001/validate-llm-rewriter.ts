#!/usr/bin/env ts-node
/**
 * Sprint 249 Validation — LLM Script Rewriter
 * Checks: module loads, exports, dry-run works, ScriptAgent has runAsync
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
  console.log("\n=== Sprint 249 Validation — LLM Script Rewriter ===\n");

  // 1. LLM rewriter module loads
  let rewriter: any;
  try {
    rewriter = await import("./llm-script-rewriter");
    assert("llm-script-rewriter module loads", true);
  } catch (e: any) {
    assert("llm-script-rewriter module loads", false, e.message);
    process.exit(1);
  }

  // 2. Key exports
  assert("rewriteScript exported", typeof rewriter.rewriteScript === "function");
  assert("rewriteBatch exported", typeof rewriter.rewriteBatch === "function");

  // 3. Dry run with mock bundle
  const mockBundle = {
    script_id: "test-001",
    insight_id: "insight-001",
    clip_id: "clip-001",
    segments: [
      { segment_name: "hook", start_s: 0, end_s: 2, voiceover_text: "Test hook", visual_directive: "title_card", caption_text: "Test hook" },
      { segment_name: "context", start_s: 2, end_s: 5, voiceover_text: "Test context", visual_directive: "text_overlay", caption_text: "Test context" },
    ],
    pattern_interrupts: [],
    total_duration_seconds: 24,
    loop_ending: false,
    why_does_this_matter: "Test insight",
    speaker_name: "Test Speaker",
    hook_formula_used: "curiosity_gap",
  };

  try {
    const result = await rewriter.rewriteScript({ bundle: mockBundle }, false, true);
    assert("Dry run returns RewriteResult", result && "bundle" in result && "rewritten" in result);
    assert("Dry run not rewritten", result.rewritten === false);
    assert("Dry run cost is 0", result.cost_usd === 0);
    assert("Dry run model is dry-run", result.model_used === "dry-run");
  } catch (e: any) {
    assert("Dry run works", false, e.message);
  }

  // 4. ScriptAgent has runAsync
  try {
    const scriptModule = await import("../../agents/scs001-script/index");
    const agent = new scriptModule.ScriptAgent();
    assert("ScriptAgent has runAsync method", typeof agent.runAsync === "function");
    assert("ScriptAgent still has run method", typeof agent.run === "function");
  } catch (e: any) {
    assert("ScriptAgent loads with LLM rewriter", false, e.message);
  }

  // 5. Source file check — ScriptAgent imports rewriter
  const src = require("fs").readFileSync(join(ROOT, "agents/scs001-script/index.ts"), "utf8");
  assert("ScriptAgent imports llm-script-rewriter", src.includes("llm-script-rewriter"));
  assert("ScriptAgent has LLM_REWRITE env var", src.includes("LLM_REWRITE"));

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
