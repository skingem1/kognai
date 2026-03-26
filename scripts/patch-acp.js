const fs = require('fs');

const ACP_BLOCK = [
  '',
  '> **ACP Mandate** — This agent operates under the Agent Capability Profile',
  '> (`workspace/shared-context/ACP.md`). Ratified 2026-03-25. Capability registers',
  '> (Reasoning, Execution, Memory, Communication, Governance) are scored each sprint cycle.',
  '> ACP score below trust_floor (0.6) triggers supervised mode. Max autonomous spend: $0.10/task.',
  ''
].join('\n');

// The Five Principles block ends with this line (all on one line in the files)
const AFTER_PATTERN = 'these principles do.';

const agents = fs.readdirSync('kognai-agents');
let modified = 0;
for (const agent of agents) {
  const f = 'kognai-agents/' + agent + '/prompt.md';
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('ACP Mandate')) { console.log('SKIP (already has ACP):', f); continue; }
  if (!content.includes(AFTER_PATTERN)) { console.log('WARN (no Five Principles block):', f); continue; }
  // Insert ACP block after the line containing the Five Principles ending
  const lines = content.split('\n');
  const lineIdx = lines.findIndex(l => l.includes(AFTER_PATTERN));
  if (lineIdx === -1) { console.log('WARN (line not found):', f); continue; }
  lines.splice(lineIdx + 1, 0, ...ACP_BLOCK.split('\n'));
  fs.writeFileSync(f, lines.join('\n'));
  console.log('PATCHED:', f);
  modified++;
}
console.log('\nDone. Modified ' + modified + ' files.');
