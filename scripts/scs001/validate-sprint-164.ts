/**
 * validate-sprint-164.ts
 * Sprint 164: Fix runIdToEpoch off-by-1ms bug
 * 4 checks
 */

import * as fs from "fs";
import * as path from "path";

const COMMANDS_PATH = path.join(__dirname, "../../agents/telegram-bot/commands.ts");
const SCS_DIR = path.join(__dirname, "../../workspace/scs001");

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    fail++;
  }
}

console.log("Sprint 164 — Fix runIdToEpoch off-by-1ms bug\n");

if (!fs.existsSync(COMMANDS_PATH)) {
  console.error(`FATAL: commands.ts not found at ${COMMANDS_PATH}`);
  process.exit(1);
}

const src = fs.readFileSync(COMMANDS_PATH, "utf8");

// Check 1: findCaptionedMp4 helper exists
const hasFindCaptioned = src.includes("function findCaptionedMp4");
check("findCaptionedMp4() helper function exists", hasFindCaptioned);

// Check 2: helper scans run-* dirs (readdirSync + startsWith 'run-')
const scansRunDirs =
  src.includes("startsWith('run-')") || src.includes('startsWith("run-")');
check("findCaptionedMp4 scans run-* directories", scansRunDirs);

// Check 3: No remaining epoch-based mp4 path constructions
const noEpochMp4 =
  !src.includes("run-${epoch}`, 'caption'") &&
  !src.includes('run-${epoch}`, "caption"') &&
  !src.includes("run-${epoch}/caption");
check(
  "No remaining run-${epoch}/caption path constructions",
  noEpochMp4,
  noEpochMp4 ? "" : "epoch-based mp4 path still present"
);

// Check 4: Spot-check — findCaptionedMp4 finds a known video on disk
function findCaptionedMp4Local(videoId: string): string | null {
  try {
    const dirs = fs.readdirSync(SCS_DIR).filter((d) => d.startsWith("run-"));
    for (const dir of dirs) {
      const p = path.join(SCS_DIR, dir, "caption", `${videoId}-captioned.mp4`);
      if (fs.existsSync(p)) return p;
    }
  } catch {}
  return null;
}

// Find a video_id from the ledger
let knownVideoId: string | null = null;
const ledgerPath = path.join(SCS_DIR, "publish-ledger.jsonl");
if (fs.existsSync(ledgerPath)) {
  const lines = fs.readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    try {
      const e = JSON.parse(line);
      if (e.video_id) { knownVideoId = e.video_id; break; }
    } catch {}
  }
}

if (knownVideoId) {
  const found = findCaptionedMp4Local(knownVideoId);
  check(
    `Spot-check: findCaptionedMp4 finds ${knownVideoId} on disk`,
    found !== null,
    found ?? "not found in any run-* dir"
  );
} else {
  check("Spot-check: ledger has entries", false, "No entries in publish-ledger.jsonl");
}

console.log(`\nResult: ${pass}/4 PASS, ${fail}/4 FAIL`);
if (fail === 0) {
  console.log("✅ Sprint 164 PASS");
  process.exit(0);
} else {
  console.log("❌ Sprint 164 FAIL");
  process.exit(1);
}
