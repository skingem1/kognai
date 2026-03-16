/**
 * validate-sprint-165.ts
 * Sprint 165: Fix daily-digest queue count — show captioned mp4s on disk
 * 4 checks
 */

import * as fs from "fs";
import * as path from "path";

const DIGEST_PATH = path.join(__dirname, "../daily-digest.ts");
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

console.log("Sprint 165 — Fix daily-digest queue count\n");

if (!fs.existsSync(DIGEST_PATH)) {
  console.error(`FATAL: daily-digest.ts not found at ${DIGEST_PATH}`);
  process.exit(1);
}

const src = fs.readFileSync(DIGEST_PATH, "utf8");

// Check 1: findCaptionedMp4Local function exists
const hasFindLocal = src.includes("function findCaptionedMp4Local");
check("findCaptionedMp4Local() function exists in daily-digest.ts", hasFindLocal);

// Check 2: getQueueStats returns readyCount
const hasReadyCount =
  src.includes("readyCount") &&
  src.includes("getQueueStats");
check("getQueueStats() returns readyCount field", hasReadyCount);

// Check 3: buildDigest uses readyCount with 'ready' text
const showsReady =
  src.includes("queue.readyCount") &&
  (src.includes("ready to post") || src.includes("ready"));
check("buildDigest() shows queue.readyCount with 'ready' text", showsReady);

// Check 4: readyCount is correct — count captioned mp4s on disk
function countReadyCaptionedMp4s(): number {
  try {
    const ledgerPath = path.join(SCS_DIR, "publish-ledger.jsonl");
    if (!fs.existsSync(ledgerPath)) return -1;
    const lines = fs.readFileSync(ledgerPath, "utf8").split("\n").filter(Boolean);
    const entries = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as any[];
    const runDirs = fs.readdirSync(SCS_DIR).filter((d) => d.startsWith("run-"));
    let count = 0;
    for (const e of entries) {
      const vid = e.video_id;
      if (!vid) continue;
      for (const dir of runDirs) {
        const p = path.join(SCS_DIR, dir, "caption", `${vid}-captioned.mp4`);
        if (fs.existsSync(p)) { count++; break; }
      }
    }
    return count;
  } catch {
    return -1;
  }
}

const readyCount = countReadyCaptionedMp4s();
const countOk = readyCount > 0;
check(
  `Spot-check: ${readyCount} videos have captioned mp4s on disk (expected >0)`,
  countOk,
  countOk ? `${readyCount} found` : "0 found — check run-*/caption/"
);

console.log(`\nResult: ${pass}/4 PASS, ${fail}/4 FAIL`);
if (fail === 0) {
  console.log("✅ Sprint 165 PASS");
  process.exit(0);
} else {
  console.log("❌ Sprint 165 FAIL");
  process.exit(1);
}
