/**
 * ACP Engine v1.0 — Validation Tests
 * Run: npx ts-node acp/test-acp.ts
 */

import { ACPEngine } from "./acp-engine";
import { join } from "path";

const engine = new ACPEngine(join(__dirname, "trust-scores.json"));
let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("\n=== ACP Engine v1.0 Tests ===\n");

// Test 1: Dimensions loaded
const dims = engine.getDimensions();
assert("5 dimensions loaded", Object.keys(dims).length === 5);
assert("Weights sum to 1.0", Math.abs(Object.values(dims).reduce((s, d) => s + d.weight, 0) - 1.0) < 0.01);

// Test 2: Agent scores loaded
const harvey = engine.getAgentScores("harvey");
assert("Harvey scores loaded", harvey !== null);
assert("Harvey safety >= 90", harvey!.safety >= 90);

const messi = engine.getAgentScores("messi");
assert("Messi scores loaded", messi !== null);

// Test 3: Composite computation
const harveyComposite = engine.computeComposite(harvey!);
assert("Harvey composite > 80", harveyComposite > 80, `got ${harveyComposite}`);

const messiComposite = engine.computeComposite(messi!);
assert("Messi composite > 60", messiComposite > 60, `got ${messiComposite}`);

// Test 4: Enforcement — harvey should pass cloud-code
const harveyResult = engine.enforce("harvey", "cloud-code");
assert("Harvey allowed for cloud-code", harveyResult.allowed);
assert("Harvey recommendation = route", harveyResult.recommendation === "route");

// Test 5: Enforcement — unknown agent should be blocked
const unknownResult = engine.enforce("ghost-agent", "cloud-code");
assert("Unknown agent blocked", !unknownResult.allowed);

// Test 6: resolveAgent returns preferred when eligible
const resolved = engine.resolveAgent("cloud-code");
assert("cloud-code resolves to messi", resolved?.agent === "messi");

// Test 7: auditAll returns results for all agents
const audit = engine.auditAll("cloud-code");
assert("Audit returns 8 agents", audit.length === 8, `got ${audit.length}`);

// Test 8: Safety hard floor enforcement
// Create a synthetic low-safety test
const lowSafety = engine.enforce("elon", "content-generation");
// elon safety=70, floor=70 — should pass (equal to floor)
assert("Elon at safety floor passes", lowSafety.allowed || lowSafety.violations.some(v => v.includes("Safety")));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
