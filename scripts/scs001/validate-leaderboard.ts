// Sprint 333 — validate-leaderboard.ts
// Validates the content leaderboard generator and /leaderboard command.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== Sprint 333 — Content Leaderboard Validation ===\n');

// Test 1: Generator module
console.log('Test 1: Generator module');
const genPath = path.join(ROOT, 'scripts', 'scs001', 'content-leaderboard.ts');
assert('Generator file exists', existsSync(genPath));

const genSrc = readFileSync(genPath, 'utf-8');
assert('Exports generateLeaderboard', genSrc.includes('export function generateLeaderboard'));
assert('Reads experiments.jsonl', genSrc.includes('experiments.jsonl'));
assert('Outputs content-leaderboard.json', genSrc.includes('content-leaderboard.json'));
assert('Ranks by speaker', genSrc.includes("'speaker'"));
assert('Ranks by hook_formula', genSrc.includes("'hook_formula'"));
assert('Deduplicates by clip_id', genSrc.includes('clip_id'));

// Test 2: Bot command
console.log('\nTest 2: Bot command');
const cmdPath = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const cmdSrc = readFileSync(cmdPath, 'utf-8');
assert('handleLeaderboard exported', cmdSrc.includes('export async function handleLeaderboard'));
assert('Calls generateLeaderboard', cmdSrc.includes('generateLeaderboard'));
assert('Shows speakers', cmdSrc.includes('Top Speakers'));
assert('Shows hooks', cmdSrc.includes('Top Hook Formulas'));
assert('Shows best videos', cmdSrc.includes('Best Videos'));

// Test 3: Bot routing
console.log('\nTest 3: Bot routing');
const idxPath = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');
const idxSrc = readFileSync(idxPath, 'utf-8');
assert('Imports handleLeaderboard', idxSrc.includes('handleLeaderboard'));
assert('Routes /leaderboard case', idxSrc.includes("case '/leaderboard'"));

// Test 4: Functional test
console.log('\nTest 4: Functional test');
try {
  const { generateLeaderboard } = require(path.join(ROOT, 'scripts', 'scs001', 'content-leaderboard'));
  const lb = generateLeaderboard();
  assert('Has generated_at', typeof lb.generated_at === 'string');
  assert('Has total_experiments', typeof lb.total_experiments === 'number');
  assert('Has speakers array', Array.isArray(lb.speakers));
  assert('Has hooks array', Array.isArray(lb.hooks));
  assert('Has top_videos array', Array.isArray(lb.top_videos));

  if (lb.speakers.length > 0) {
    const s = lb.speakers[0];
    assert('Speaker has name', typeof s.name === 'string');
    assert('Speaker has avg_score', typeof s.avg_score === 'number');
    assert('Speaker has count', typeof s.count === 'number');
    assert('Speaker has qc_rate', typeof s.qc_rate === 'number');
    console.log(`  INFO  Top speaker: ${s.name} (avg ${Math.round(s.avg_score * 100)}%, ${s.count} clips)`);
  }

  if (lb.top_videos.length > 0) {
    const v = lb.top_videos[0];
    assert('Video has clip_id', typeof v.clip_id === 'string');
    assert('Video has score', typeof v.score === 'number');
    console.log(`  INFO  Top video: ${v.clip_id} (${Math.round(v.score * 100)}%)`);
  }

  // Output file
  assert('Output file written', existsSync(path.join(ROOT, 'reports', 'content-leaderboard.json')));
} catch (err) {
  assert('Generator runs without error', false, (err as Error).message);
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
