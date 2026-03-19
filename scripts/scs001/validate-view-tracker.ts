#!/usr/bin/env ts-node
/**
 * validate-view-tracker.ts — Sprint 266
 * Validates the TikTok view count tracker and PM2 cron config.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════');
console.log('  Sprint 266 — View Tracker Validation');
console.log('══════════════════════════════════════════════\n');

// Test 1: Script exists and has key functions
console.log('Test 1: fetch-tiktok-views.ts structure');
const scriptPath = path.join(ROOT, 'scripts', 'scs001', 'fetch-tiktok-views.ts');
try {
  const src = fs.readFileSync(scriptPath, 'utf-8');
  assert('Script exists', src.length > 0);
  assert('Has fetchOEmbed function', src.includes('function fetchOEmbed('));
  assert('Has buildTikTokUrl function', src.includes('function buildTikTokUrl('));
  assert('Has loadPosts function', src.includes('function loadPosts('));
  assert('Has savePosts function', src.includes('function savePosts('));
  assert('Has sendTelegramAlert function', src.includes('function sendTelegramAlert('));
  assert('Uses manual-posts.jsonl', src.includes('manual-posts.jsonl'));
  assert('Has gate targets (30 posts, 500 views)', src.includes('POSTS_TARGET = 30') && src.includes('VIEWS_TARGET = 500'));
  assert('Has DRY_RUN support', src.includes('VIEW_FETCH_DRY_RUN'));
  assert('Has rate limiting', src.includes('200'));
  assert('Uses oEmbed endpoint', src.includes('tiktok.com/oembed'));
  assert('Logs to view-tracker.jsonl', src.includes('view-tracker.jsonl'));
} catch (e: any) {
  assert('Script readable', false, e.message);
}

// Test 2: PM2 config
console.log('\nTest 2: PM2 cron config');
try {
  const eco = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf-8');
  assert('PM2 config has kognai-view-tracker', eco.includes('kognai-view-tracker'));
  assert('Cron set to 10:00 daily', eco.includes('0 10 * * *'));
  assert('Points to correct script', eco.includes('scripts/scs001/fetch-tiktok-views.ts'));
  assert('autorestart: false (cron mode)', eco.includes('autorestart: false') && eco.includes('kognai-view-tracker'));
} catch (e: any) {
  assert('ecosystem.config.js readable', false, e.message);
}

// Test 3: Sprint JSON
console.log('\nTest 3: Sprint file');
try {
  const sprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'workspace', 'sprints', 'sprint-266.json'), 'utf-8'));
  assert('Sprint file valid JSON', sprint.sprint_id === 'sprint-266');
  assert('Has 3 tasks', sprint.tasks.length === 3);
} catch (e: any) {
  assert('Sprint file', false, e.message);
}

// Test 4: Dry-run execution
console.log('\nTest 4: Dry-run execution');
try {
  const { execSync } = require('child_process');
  const output = execSync(
    'VIEW_FETCH_DRY_RUN=1 npx ts-node scripts/scs001/fetch-tiktok-views.ts 2>&1',
    { cwd: ROOT, timeout: 30000, encoding: 'utf-8' }
  );
  assert('Dry-run completes without crash', output.includes('View Count Tracker'));
  assert('Reports post count', output.includes('posts') || output.includes('No manual posts'));
} catch (e: any) {
  assert('Dry-run execution', false, e.message?.slice(0, 100));
}

// Summary
console.log('\n──────────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`  Overall: ${failed === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('══════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
