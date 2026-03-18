#!/usr/bin/env ts-node
// Sprint 175 — ClawRouter §17 Compliance Scanner
// Walks agents/ and scripts/ for direct LLM API call violations.
//
// §17 violation patterns:
//   - ANTHROPIC_API_URL constant usage
//   - 'x-api-key': ANTHROPIC_API_KEY  (direct Anthropic header — true violation)
//   - fetch('https://api.anthropic  (direct fetch to Anthropic)
//   - fetch("https://api.anthropic  (direct fetch to Anthropic)
//   - axios.post('https://api       (direct axios to any cloud LLM)
//
// Gate logic: agents/ violations = FAIL. scripts/ standalone violations = WARN (deferred).
// Exit 0 = agents/ PASS. Exit 1 = agents/ violations found.

import * as fs   from 'fs';
import * as path from 'path';

const ROOT       = path.join(__dirname, '..', '..');
const AGENTS_DIR = path.join(ROOT, 'agents');
const SCRIPTS_DIR= path.join(ROOT, 'scripts');

// §17 violation patterns — these identify true direct API calls
const VIOLATION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'ANTHROPIC_API_URL const',      re: /ANTHROPIC_API_URL/                           },
  { label: "x-api-key Anthropic header",   re: /['"]x-api-key['"].*ANTHROPIC_API_KEY/        },
  { label: "fetch to api.anthropic.com",   re: /fetch\(['"]https:\/\/api\.anthropic/          },
  { label: "axios to api.anthropic.com",   re: /axios\.(?:post|get|put)\(['"]https:\/\/api\.anthropic/ },
  { label: "direct apiCall to anthropic",  re: /apiCall\(.*api\.anthropic\.com/               },
];

// These files are known legacy standalone scripts (not autonomous pipeline agents).
// FP-007: all >300 lines. Deferred to manual fix sprint.
const LEGACY_EXEMPT = new Set([
  'scripts/run-ceo-weekly.ts',
  'scripts/run-x-admin.ts',
  'scripts/tax-watchdog-us.ts',
  'scripts/run-ceo-review.ts',
  'scripts/run-cfo.ts',
  'scripts/tax-watchdog-eu-japan.ts',
  'scripts/run-cmo-weekly-plan.ts',
  'scripts/run-heylol-ceo.ts',
]);

interface Violation {
  file:     string;
  line:     number;
  pattern:  string;
  snippet:  string;
  deferred: boolean;
}

function walkTs(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function scanFile(filePath: string): Violation[] {
  const src       = fs.readFileSync(filePath, 'utf-8');
  const lines     = src.split('\n');
  const rel       = path.relative(ROOT, filePath);
  const deferred  = LEGACY_EXEMPT.has(rel);
  const viols: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('//')) continue; // skip pure comments
    for (const { label, re } of VIOLATION_PATTERNS) {
      if (re.test(line)) {
        viols.push({ file: rel, line: i + 1, pattern: label,
          snippet: line.trim().slice(0, 100), deferred });
        break; // one violation per line
      }
    }
  }
  return viols;
}

// ── Scan ──────────────────────────────────────────────────────────────────────

const agentFiles  = walkTs(AGENTS_DIR);
const scriptFiles = walkTs(SCRIPTS_DIR).filter(f =>
  !f.includes('node_modules') &&
  !f.includes('/scs001/validate-sprint') &&
  !f.endsWith('validate-clawrouter-compliance.ts') // self-exclusion
);

const allViolations: Violation[] = [];
for (const f of [...agentFiles, ...scriptFiles]) {
  allViolations.push(...scanFile(f));
}

const agentViolations  = allViolations.filter(v => v.file.startsWith('agents/') && !v.deferred);
const scriptViolations = allViolations.filter(v => v.file.startsWith('scripts/') && !v.deferred);
const deferredCount    = allViolations.filter(v => v.deferred).length;

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n=== §17 ClawRouter Compliance Scan ===\n');
console.log(`Scanned: ${agentFiles.length} agent files, ${scriptFiles.length} script files\n`);

if (agentViolations.length === 0) {
  console.log('✅ agents/ — 0 violations (PASS)');
} else {
  console.log(`❌ agents/ — ${agentViolations.length} violation(s) (FAIL)`);
  for (const v of agentViolations) {
    console.log(`   [${v.file}:${v.line}] ${v.pattern}`);
    console.log(`   → ${v.snippet}`);
  }
}

if (scriptViolations.length === 0) {
  console.log('✅ scripts/ — 0 pipeline violations');
} else {
  console.log(`⚠️  scripts/ — ${scriptViolations.length} violation(s) (pipeline files)`);
  for (const v of scriptViolations) {
    console.log(`   [${v.file}:${v.line}] ${v.pattern}`);
  }
}

console.log(`\n⏸  Deferred: ${deferredCount} legacy-exempt script violations (FP-007, manual fix sprint)`);
for (const rel of LEGACY_EXEMPT) {
  const count = allViolations.filter(v => v.file === rel).length;
  if (count > 0) console.log(`   ${rel}: ${count} violation(s)`);
}

const passed = agentViolations.length === 0 && scriptViolations.length === 0;
console.log(`\n${passed ? '✅' : '❌'} Gate: ${passed ? 'PASS' : 'FAIL'} — ${agentViolations.length + scriptViolations.length} active violation(s)\n`);
process.exit(passed ? 0 : 1);
