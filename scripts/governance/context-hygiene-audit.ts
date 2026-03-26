/**
 * context-hygiene-audit.ts — Sprint TICKET-005-RULE4
 * Rule 4 (Context Hygiene): Scans all kognai-agents prompt.md files for
 * Input Context scope declarations. Logs contamination audit results.
 *
 * Usage:
 *   npx ts-node scripts/governance/context-hygiene-audit.ts
 *   npx ts-node scripts/governance/context-hygiene-audit.ts --json
 *
 * Output: logs/context-hygiene/YYYY-MM-DD.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ROOT         = path.resolve(__dirname, '../..');
const AGENTS_DIR   = path.join(ROOT, 'kognai-agents');
const LOG_DIR      = path.join(ROOT, 'logs', 'context-hygiene');
const JSON_FLAG    = process.argv.includes('--json');

// Patterns that indicate a context scope declaration
const SCOPE_PATTERNS = [
  /^##\s+(Input Context|Context Scope|Allowed Inputs|Input Scope)/im,
  /allowed_inputs:/im,
  /input_context:/im,
];

interface AgentAudit {
  agent: string;
  prompt_path: string;
  has_scope_declaration: boolean;
  scope_section: string | null;
  risk_level: 'compliant' | 'undeclared';
}

function checkAgentPrompt(agentDir: string): AgentAudit | null {
  const promptPath = path.join(agentDir, 'prompt.md');
  if (!fs.existsSync(promptPath)) return null;

  const name    = path.basename(agentDir);
  const content = fs.readFileSync(promptPath, 'utf-8');

  let scopeSection: string | null = null;
  let hasScopeDecl = false;

  for (const pattern of SCOPE_PATTERNS) {
    if (pattern.test(content)) {
      hasScopeDecl = true;
      // Extract first 3 lines of the matching section
      const match = content.match(pattern);
      if (match?.index !== undefined) {
        const start = content.lastIndexOf('\n', match.index) + 1;
        const end   = content.indexOf('\n\n', start);
        scopeSection = content.slice(start, end > 0 ? end : start + 200).split('\n').slice(0, 3).join(' ').trim();
      }
      break;
    }
  }

  return {
    agent: name,
    prompt_path: path.relative(ROOT, promptPath),
    has_scope_declaration: hasScopeDecl,
    scope_section: scopeSection,
    risk_level: hasScopeDecl ? 'compliant' : 'undeclared',
  };
}

function run() {
  if (!fs.existsSync(AGENTS_DIR)) { console.error(`Agents dir not found: ${AGENTS_DIR}`); process.exit(1); }

  const agentDirs = fs.readdirSync(AGENTS_DIR)
    .map(d => path.join(AGENTS_DIR, d))
    .filter(d => fs.statSync(d).isDirectory());

  const results: AgentAudit[] = [];
  for (const dir of agentDirs) {
    const a = checkAgentPrompt(dir);
    if (a) results.push(a);
  }

  const undeclared  = results.filter(r => r.risk_level === 'undeclared');
  const compliant   = results.filter(r => r.risk_level === 'compliant');

  const report = {
    run_id:           crypto.randomBytes(4).toString('hex'),
    timestamp:        new Date().toISOString(),
    agents_scanned:   results.length,
    compliant_count:  compliant.length,
    undeclared_count: undeclared.length,
    agents:           results,
    recommendation:   undeclared.length > 0
      ? `${undeclared.length} agents missing Input Context declaration — see docs/governance/context-scope-standard.md`
      : 'All agents compliant with Rule 4 (Context Hygiene).',
  };

  // Log to context-hygiene/
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify(report) + '\n');

  if (JSON_FLAG) { console.log(JSON.stringify(report, null, 2)); return; }

  console.log('\n=== Context Hygiene Audit (Rule 4) ===');
  console.log(`Scanned:    ${results.length} agents`);
  console.log(`Compliant:  ${compliant.length}`);
  console.log(`Undeclared: ${undeclared.length}`);
  console.log('');

  if (undeclared.length > 0) {
    console.log('Undeclared agents (missing ## Input Context section):');
    undeclared.forEach(a => console.log(`  ✗ ${a.agent}`));
    console.log('');
    console.log('→ See docs/governance/context-scope-standard.md for the template.');
  }

  if (compliant.length > 0) {
    console.log('Compliant agents:');
    compliant.forEach(a => console.log(`  ✓ ${a.agent}`));
  }

  console.log(`\nLogged to: ${path.relative(ROOT, logFile)}`);
}

run();
