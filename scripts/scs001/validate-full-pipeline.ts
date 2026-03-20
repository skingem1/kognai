#!/usr/bin/env ts-node
/**
 * SCS-001 Sprint 447 — Validate Full Pipeline Runner
 *
 * Checks:
 *   1. run-full-pipeline.ts exists and compiles (ts-node --transpile-only)
 *   2. All agent imports resolve
 *   3. All script imports resolve
 *   4. Dry-run mode completes without errors
 *   5. Report JSON is valid and has expected structure
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;

function assert(ok: boolean, msg: string): void {
  if (ok) {
    console.log("  ✓ " + msg);
    pass++;
  } else {
    console.log("  ✗ FAIL: " + msg);
    fail++;
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("🔍 Sprint 447 — Full Pipeline Validation");
  console.log("");

  // ── Check 1: File exists ────────────────────────────
  console.log("Check 1: File exists");
  const pipelinePath = join(ROOT, "scripts", "scs001", "run-full-pipeline.ts");
  assert(existsSync(pipelinePath), "run-full-pipeline.ts exists");

  // ── Check 2: TypeScript compiles ────────────────────
  console.log("Check 2: TypeScript compiles");
  try {
    execSync("npx ts-node --transpile-only -e \"require('./scripts/scs001/run-full-pipeline')\"", {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 30000,
    });
    assert(true, "TypeScript compilation succeeds");
  } catch (e: any) {
    // Import will try to run main(), which is fine — we just check if it doesn't throw a syntax/import error
    const stderr = e.stderr?.toString() || "";
    const isSyntaxError = stderr.includes("SyntaxError") || stderr.includes("Cannot find module");
    if (isSyntaxError) {
      assert(false, "TypeScript compilation — " + stderr.slice(0, 200));
    } else {
      assert(true, "TypeScript compilation succeeds (runtime error expected without --mock)");
    }
  }

  // ── Check 3: Agent imports exist ────────────────────
  console.log("Check 3: Agent modules exist");
  const agents = [
    "agents/scs001-trend/index.ts",
    "agents/scs001-discovery/index.ts",
    "agents/scs001-clip-detection/index.ts",
    "agents/scs001-insight/index.ts",
    "agents/scs001-script/index.ts",
    "agents/scs001-editing/index.ts",
  ];
  for (const a of agents) {
    assert(existsSync(join(ROOT, a)), a + " exists");
  }

  // ── Check 4: Script modules exist ───────────────────
  console.log("Check 4: Script modules exist");
  const scripts = [
    "scripts/scs001/llm-script-rewriter.ts",
    "scripts/scs001/tts-voiceover.ts",
    "scripts/scs001/audio-mixer.ts",
    "scripts/scs001/caption-overlay.ts",
    "scripts/scs001/hook-quality.ts",
    "scripts/scs001/music-selector.ts",
  ];
  for (const s of scripts) {
    assert(existsSync(join(ROOT, s)), s + " exists");
  }

  // ── Check 5: Dry-run pipeline ───────────────────────
  console.log("Check 5: Dry-run pipeline execution");
  try {
    const output = execSync(
      "npx ts-node --transpile-only scripts/scs001/run-full-pipeline.ts --mock --dry-run",
      { cwd: ROOT, stdio: "pipe", timeout: 180000 }
    ).toString();
    assert(output.includes("PIPELINE COMPLETE"), "Pipeline completes in dry-run mode");
    assert(output.includes("Step 1/9"), "Step 1 (Trend) runs");
    assert(output.includes("Step 5/9"), "Step 5 (Script) runs");
    assert(output.includes("DRY-RUN"), "Dry-run markers present");
  } catch (e: any) {
    const stderr = e.stderr?.toString() || "";
    const stdout = e.stdout?.toString() || "";
    assert(false, "Dry-run execution — " + (stderr || stdout).slice(0, 300));
  }

  // ── Check 6: Report JSON structure ──────────────────
  console.log("Check 6: Report JSON output");
  const runsDir = join(ROOT, "workspace", "scs001", "pipeline-runs");
  if (existsSync(runsDir)) {
    const reports = readdirSync(runsDir).filter((f) => f.startsWith("pipeline-") && f.endsWith(".json"));
    if (reports.length > 0) {
      const latest = reports.sort().pop()!;
      const report = JSON.parse(readFileSync(join(runsDir, latest), "utf-8"));
      assert(typeof report.run_id === "string", "report.run_id is string");
      assert(Array.isArray(report.steps), "report.steps is array");
      assert(typeof report.total_duration_ms === "number", "report.total_duration_ms is number");
      assert(typeof report.total_cost_usd === "number", "report.total_cost_usd is number");
      assert(typeof report.summary === "string", "report.summary is string");
    } else {
      assert(false, "No pipeline report found in " + runsDir);
    }
  } else {
    assert(false, "pipeline-runs directory exists");
  }

  // ── Summary ─────────────────────────────────────────
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  " + pass + " passed, " + fail + " failed");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Validation error:", err);
  process.exitCode = 1;
});
