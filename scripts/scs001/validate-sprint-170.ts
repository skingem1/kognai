#!/usr/bin/env ts-node
// Sprint 170 validation: posting-reminder.ts runIdToEpoch bug fix checks
// 4 checks — exit 0 on all pass

import * as fs   from 'fs';
import * as path from 'path';

const ROOT         = path.join(__dirname, '..', '..');
const REMINDER_PATH = path.join(ROOT, 'scripts', 'posting-reminder.ts');

let passed = 0;
const total = 4;

function check(label: string, fn: () => boolean): void {
  try {
    if (fn()) { console.log(`✅ ${label}`); passed++; }
    else       { console.log(`❌ ${label}`); }
  } catch (e) {
    console.log(`❌ ${label} — threw: ${(e as Error).message}`);
  }
}

const src = fs.readFileSync(REMINDER_PATH, 'utf-8');

// 1. findCaptionedMp4 function present
check('posting-reminder.ts contains findCaptionedMp4 function', () =>
  src.includes('function findCaptionedMp4'));

// 2. runIdToEpoch removed (the buggy function)
check('posting-reminder.ts does NOT contain runIdToEpoch (removed)', () =>
  !src.includes('runIdToEpoch'));

// 3. scans run- directories
check("posting-reminder.ts scans 'run-' directories", () =>
  src.includes("startsWith('run-')"));

// 4. main loop uses findCaptionedMp4
check('main loop uses findCaptionedMp4(CWD, e.video_id)', () =>
  src.includes('findCaptionedMp4(CWD, e.video_id)'));

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
