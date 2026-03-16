// validate-sprint-154.ts — Sprint 154: /post-now manual posting assistant
// 5 checks: export, existsSync check, handleHelp, index routing, viral-topics hashtags

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
let pass = 0; let fail = 0;

function check(name: string, ok: boolean): void {
  if (ok) { console.log(`✅ ${name}`); pass++; }
  else    { console.error(`❌ ${name}`); fail++; }
}

const cmdSrc = readFileSync(join(ROOT, 'agents', 'telegram-bot', 'commands.ts'), 'utf-8');
const idxSrc = readFileSync(join(ROOT, 'agents', 'telegram-bot', 'index.ts'), 'utf-8');

// 1. commands.ts exports handlePostNow
check('commands.ts exports handlePostNow', cmdSrc.includes('export async function handlePostNow'));

// 2. handlePostNow checks existsSync for captioned mp4
check('handlePostNow checks existsSync for captioned mp4',
  cmdSrc.includes('captioned.mp4') && cmdSrc.includes('existsSync(mp4)'));

// 3. handleHelp contains /post-now
check('handleHelp contains /post-now', cmdSrc.includes('/post-now'));

// 4. index.ts routes /post-now
check("index.ts routes '/post-now'",
  idxSrc.includes("'/post-now'") && idxSrc.includes('handlePostNow'));

// 5. handlePostNow loads viral-topics.json for hashtags
check('handlePostNow loads viral-topics.json', cmdSrc.includes('viral-topics.json'));

console.log(`\n${pass}/5 PASS${fail > 0 ? ` — ${fail} FAIL` : ''}`);
if (fail > 0) process.exit(1);
