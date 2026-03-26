const fs = require('fs');

const SOUL_BLOCK = [
  '',
  '> **SOUL Mandate** — This agent is an expression of `workspace/SOUL.md`.',
  '> Harvey identity, founding principles, and constitutional mission govern all outputs.',
  '> Read SOUL.md before any strategic or creative task. Outputs must be consistent with',
  '> the founder\u2019s voice, civilizational mission, and sovereign-by-design ethos.',
  ''
].join('\n');

// Insert after ACP Mandate block (which ends with this line)
const AFTER_PATTERN = '> ACP score below trust_floor (0.6) triggers supervised mode. Max autonomous spend: $0.10/task.';

// Skip these agents (already have SOUL reference)
const SKIP = new Set(['ceo', 'cmo', 'conway-integration']);

const agents = fs.readdirSync('kognai-agents');
let modified = 0;
for (const agent of agents) {
  if (SKIP.has(agent)) { console.log('SKIP (already has SOUL):', agent); continue; }
  const f = 'kognai-agents/' + agent + '/prompt.md';
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('SOUL Mandate')) { console.log('SKIP (already has SOUL Mandate):', f); continue; }
  if (!content.includes(AFTER_PATTERN)) { console.log('WARN (no ACP block):', f); continue; }
  const lines = content.split('\n');
  const lineIdx = lines.findIndex(l => l.includes('ACP score below trust_floor'));
  if (lineIdx === -1) { console.log('WARN (ACP line not found):', f); continue; }
  lines.splice(lineIdx + 1, 0, ...SOUL_BLOCK.split('\n'));
  fs.writeFileSync(f, lines.join('\n'));
  console.log('PATCHED:', f);
  modified++;
}
console.log('\nDone. Modified ' + modified + ' files.');
