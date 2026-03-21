/**
 * validate-crossplatform-output.ts — Sprint 678
 * Validates cross-platform-publish.ts structure and dry-run mode.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'scs001', 'cross-platform-publish.ts');
const YT_SCRIPT = join(ROOT, 'scripts', 'scs001', 'youtube-shorts.ts');

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n=== Cross-Platform Publisher Validation ===\n');

// Test 1: Scripts exist
check('cross-platform-publish.ts exists', existsSync(SCRIPT));
check('youtube-shorts.ts exists', existsSync(YT_SCRIPT));

// Test 2: Script has key features
const src = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf-8') : '';
check('Has --status mode', src.includes('--status'));
check('Has --dry-run mode', src.includes('--dry-run'));
check('Has --video-id mode', src.includes('--video-id'));
check('Has --all-pending mode', src.includes('--all-pending'));
check('Has YouTube upload integration', src.includes('uploadShort'));
check('Has cross-platform log', src.includes('crossplatform-publish.jsonl'));
check('Has buildYouTubeMetadata', src.includes('buildYouTubeMetadata'));
check('Has showStatus export', src.includes('showStatus'));

// Test 3: Status mode runs
try {
  const statusOut = execSync(
    `npx ts-node ${SCRIPT} --status`,
    { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 }
  );
  check('Status mode runs', true);
  check('Status shows YouTube', statusOut.includes('YouTube'));
  check('Status shows TikTok', statusOut.includes('TikTok'));
  check('Status shows video counts', statusOut.includes('Delivered'));
} catch (e: any) {
  check('Status mode runs', false, e.message?.slice(0, 100));
  check('Status shows YouTube', false);
  check('Status shows TikTok', false);
  check('Status shows video counts', false);
}

// Test 4: Dry-run mode runs
try {
  const dryOut = execSync(
    `YOUTUBE_DRY_RUN=1 npx ts-node ${SCRIPT} --dry-run`,
    { cwd: ROOT, encoding: 'utf-8', timeout: 30_000 }
  );
  check('Dry-run mode runs', true);
  check('Dry-run header present', dryOut.includes('DRY RUN'));
} catch (e: any) {
  check('Dry-run mode runs', false, e.message?.slice(0, 100));
  check('Dry-run header present', false);
}

// Test 5: YouTube Shorts client has upload function
const ytSrc = existsSync(YT_SCRIPT) ? readFileSync(YT_SCRIPT, 'utf-8') : '';
check('YT client has uploadShort', ytSrc.includes('export async function uploadShort'));
check('YT client has checkUploadReadiness', ytSrc.includes('export function checkUploadReadiness'));

console.log(`\n--- Results: ${pass} passed, ${fail} failed ---`);
console.log(fail === 0 ? '\nPASS' : '\nFAIL');
process.exit(fail === 0 ? 0 : 1);
