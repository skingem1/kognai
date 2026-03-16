#!/usr/bin/env ts-node
// Sprint 167 validation: /post-batch command checks
// 5 checks — exit 0 on all pass

import * as fs   from 'fs';
import * as path from 'path';

const ROOT         = path.join(__dirname, '..', '..');
const COMMANDS_TS  = path.join(ROOT, 'agents', 'telegram-bot', 'commands.ts');
const INDEX_TS     = path.join(ROOT, 'agents', 'telegram-bot', 'index.ts');

let passed = 0;
const total = 5;

function check(label: string, fn: () => boolean): void {
  try {
    if (fn()) { console.log(`✅ ${label}`); passed++; }
    else       { console.log(`❌ ${label}`); }
  } catch (e) {
    console.log(`❌ ${label} — threw: ${(e as Error).message}`);
  }
}

const cmdSrc   = fs.readFileSync(COMMANDS_TS, 'utf-8');
const indexSrc = fs.readFileSync(INDEX_TS,    'utf-8');

// 1. handlePostBatch exported from commands.ts
check('handlePostBatch exported from commands.ts', () =>
  cmdSrc.includes('export async function handlePostBatch'));

// 2. commands.ts contains 'post-batch' (help line)
check('commands.ts contains post-batch help entry', () =>
  cmdSrc.includes('post-batch'));

// 3. index.ts imports handlePostBatch
check('index.ts imports handlePostBatch', () =>
  indexSrc.includes('handlePostBatch'));

// 4. index.ts routes /post-batch
check("index.ts routes '/post-batch'", () =>
  indexSrc.includes("'/post-batch'"));

// 5. commands.ts contains 'Post Batch' header text
check("commands.ts contains 'Post Batch' header message", () =>
  cmdSrc.includes('Post Batch'));

console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
