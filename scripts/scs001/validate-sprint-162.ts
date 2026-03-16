/**
 * validate-sprint-162.ts
 * Sprint 162: Brief generator OLLAMA_HOST fix + fallback
 * 4 checks
 */

import * as fs from "fs";
import * as path from "path";

const SCRIPT_PATH = path.join(
  __dirname,
  "../../scripts/generate-sprint-brief.py"
);
// __dirname is scripts/scs001 — script is scripts/generate-sprint-brief.py
const BRIEF_SCRIPT = path.join(__dirname, "../generate-sprint-brief.py");

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

console.log("Sprint 162 — Brief generator: OLLAMA_HOST fix + fallback\n");

const scriptPath = BRIEF_SCRIPT;
if (!fs.existsSync(scriptPath)) {
  console.error(`FATAL: Script not found at ${scriptPath}`);
  process.exit(1);
}

const src = fs.readFileSync(scriptPath, "utf8");

// Check 1: OLLAMA_HOST loaded from env (not hardcoded localhost in URL assignment)
const usesOllamaHostEnv =
  src.includes("OLLAMA_HOST") &&
  (src.includes("os.environ.get") || src.includes("load_env_file"));
const urlNotHardcoded = !src.includes('"http://localhost:11434/api/generate"');
check(
  "OLLAMA_HOST loaded from env (not hardcoded localhost URL)",
  usesOllamaHostEnv && urlNotHardcoded,
  usesOllamaHostEnv ? (urlNotHardcoded ? "" : "URL still hardcoded") : "OLLAMA_HOST env not read"
);

// Check 2: Fallback function exists
const hasFallback =
  src.includes("make_fallback_sections") ||
  src.includes("make_fallback_brief") ||
  src.includes("fallback_sections");
check(
  "Fallback function exists (make_fallback_sections or equivalent)",
  hasFallback
);

// Check 3: Qwen errors don't get written directly to brief sections
// The key pattern: ollama errors are caught and fallback is invoked
const catchesOllamaError =
  (src.includes("ollama_ok") || src.includes("fallback")) &&
  src.includes("startswith") &&
  src.includes("[ERROR");
check(
  "Qwen errors detected and fallback triggered (not written raw to brief)",
  catchesOllamaError
);

// Check 4: Script is valid Python (syntax check)
import { execSync } from "child_process";
let syntaxOk = false;
let syntaxDetail = "";
try {
  execSync(`python3 -m py_compile "${scriptPath}"`, { stdio: "pipe" });
  syntaxOk = true;
} catch (e: any) {
  syntaxDetail = e.stderr?.toString()?.trim() || "syntax error";
}
check("Script passes Python syntax check (python3 -m py_compile)", syntaxOk, syntaxDetail);

console.log(`\nResult: ${pass}/4 PASS, ${fail}/4 FAIL`);
if (fail === 0) {
  console.log("✅ Sprint 162 PASS");
  process.exit(0);
} else {
  console.log("❌ Sprint 162 FAIL");
  process.exit(1);
}
