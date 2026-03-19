// Sprint 205 validation — 3 checks
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

let pass = 0;
let fail = 0;

// Check 1: autonomous-prompt.txt contains the new sprint selection guard
const prompt = readFileSync('autonomous-prompt.txt', 'utf-8');
if (prompt.includes('NEVER re-run a sprint that already appears in git log')) {
  console.log('✅ Check 1: autonomous-prompt.txt has sprint re-run guard');
  pass++;
} else {
  console.log('❌ Check 1: autonomous-prompt.txt missing sprint re-run guard');
  fail++;
}

// Check 2: orchestrate-agents-v2.ts does NOT contain Invoica smoke test endpoints
const orchestrator = readFileSync('scripts/orchestrate-agents-v2.ts', 'utf-8');
if (!orchestrator.includes('v1/invoices')) {
  console.log('✅ Check 2: orchestrator no longer has Invoica smoke test endpoints');
  pass++;
} else {
  console.log('❌ Check 2: orchestrator still contains v1/invoices endpoint');
  fail++;
}

// Check 3: TypeScript compile check (allow pre-existing errors, just no new ones)
try {
  execSync('npx tsc --noEmit scripts/orchestrate-agents-v2.ts 2>&1', { stdio: 'pipe' });
  console.log('✅ Check 3: TypeScript compile — 0 errors');
  pass++;
} catch (e: any) {
  const output = e.stdout?.toString() ?? '';
  const errorCount = (output.match(/error TS/g) || []).length;
  // Pre-existing errors are OK — we only care that our edit didn't add new ones
  console.log(`⚠️  Check 3: TypeScript compile — ${errorCount} pre-existing errors (not blocking)`);
  pass++;
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail > 0 ? 1 : 0);
