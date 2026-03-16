/**
 * validate-sprint-163.ts
 * Sprint 163: /pm2-status — PM2 process watchboard
 * 5 checks
 */

import * as fs from "fs";
import * as path from "path";

const COMMANDS_PATH = path.join(__dirname, "../../agents/telegram-bot/commands.ts");
const INDEX_PATH = path.join(__dirname, "../../agents/telegram-bot/index.ts");

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

console.log("Sprint 163 — /pm2-status: PM2 process watchboard\n");

if (!fs.existsSync(COMMANDS_PATH)) {
  console.error(`FATAL: commands.ts not found at ${COMMANDS_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(INDEX_PATH)) {
  console.error(`FATAL: index.ts not found at ${INDEX_PATH}`);
  process.exit(1);
}

const cmds = fs.readFileSync(COMMANDS_PATH, "utf8");
const idx = fs.readFileSync(INDEX_PATH, "utf8");

// Check 1: handlePm2Status exported from commands.ts
const exported = cmds.includes("export async function handlePm2Status");
check("handlePm2Status exported from commands.ts", exported);

// Check 2: pm2 jlist used in the function
const usesPm2Jlist = cmds.includes("pm2 jlist");
check("pm2 jlist command used", usesPm2Jlist);

// Check 3: Error handling around execSync
const hasTryCatch =
  cmds.includes("execSync") &&
  cmds.includes("catch") &&
  cmds.includes("pm2 jlist failed");
check("try/catch around execSync with error message", hasTryCatch);

// Check 4: Routed in index.ts
const routedInIndex =
  idx.includes("handlePm2Status") &&
  idx.includes("/pm2-status");
check("handlePm2Status imported and routed in index.ts", routedInIndex);

// Check 5: Listed in /help
const inHelp = cmds.includes("/pm2-status") && cmds.includes("handleHelp");
check("/pm2-status listed in handleHelp()", inHelp);

console.log(`\nResult: ${pass}/5 PASS, ${fail}/5 FAIL`);
if (fail === 0) {
  console.log("✅ Sprint 163 PASS");
  process.exit(0);
} else {
  console.log("❌ Sprint 163 FAIL");
  process.exit(1);
}
