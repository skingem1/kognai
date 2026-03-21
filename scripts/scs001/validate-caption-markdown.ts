#!/usr/bin/env npx ts-node
/**
 * validate-caption-markdown.ts — Sprint 680
 * Validates engagement-caption escapeMd + delivery script fallbacks.
 */

import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..', '..');
let pass = true;
const results: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  const icon = ok ? 'PASS' : 'FAIL';
  results.push(`[${icon}] ${name}: ${detail}`);
  if (!ok) pass = false;
}

// Test 1: engagement-caption.ts has escapeMd function
const ecPath = path.join(ROOT, 'scripts', 'scs001', 'engagement-caption.ts');
const ecSrc = fs.readFileSync(ecPath, 'utf-8');
check('ec-has-escapeMd', ecSrc.includes('function escapeMd'), 'escapeMd function exists in engagement-caption.ts');
check('ec-escapes-brackets', ecSrc.includes('[_*`'), 'escapeMd escapes _ * ` [ ]');
check('ec-uses-escape', ecSrc.includes("escapeMd(opts.speaker"), 'Speaker name is escaped');

// Test 2: posting-auto-deliver.ts has escapeTg function
const adPath = path.join(ROOT, 'scripts', 'scs001', 'posting-auto-deliver.ts');
const adSrc = fs.readFileSync(adPath, 'utf-8');
check('ad-has-escapeTg', adSrc.includes('function escapeTg'), 'escapeTg function exists in posting-auto-deliver.ts');
check('ad-escapes-speaker', adSrc.includes('escapeTg(speaker)'), 'Speaker escaped in tgCaption');
check('ad-escapes-hook', adSrc.includes('escapeTg(hook)'), 'Hook escaped in tgCaption');

// Test 3: posting-reminder.ts has plain text fallback
const prPath = path.join(ROOT, 'scripts', 'posting-reminder.ts');
const prSrc = fs.readFileSync(prPath, 'utf-8');
check('pr-has-fallback', prSrc.includes('sendVideoTelegramPlain'), 'sendVideoTelegramPlain fallback exists');
check('pr-catches-parse-error', prSrc.includes("can't parse entities"), 'Catches Markdown parse errors');

// Test 4: buildEngagementCaption escapes special chars in output
try {
  const { buildEngagementCaption } = require('./engagement-caption');
  // Speaker with underscores and asterisks
  const caption = buildEngagementCaption({
    videoId: 'test-abc123',
    hookFormula: 'curiosity_gap',
    speaker: 'John_Doe *CEO*',
    topic: 'AI testing',
  });
  const hasUnescapedUnderscore = /(?<!\\)_/.test(caption.split('\n').filter((l: string) => l.includes('John')).join(''));
  check('caption-escapes-underscore', !hasUnescapedUnderscore,
    hasUnescapedUnderscore ? 'Unescaped _ found in speaker line' : 'Speaker underscores properly escaped');

  const hasUnescapedAsterisk = /(?<!\\)\*/.test(caption.split('\n').filter((l: string) => l.includes('John')).join(''));
  check('caption-escapes-asterisk', !hasUnescapedAsterisk,
    hasUnescapedAsterisk ? 'Unescaped * found in speaker line' : 'Speaker asterisks properly escaped');
} catch (err: any) {
  check('caption-test', false, `Could not test buildEngagementCaption: ${err.message?.slice(0, 200)}`);
}

console.log('\n=== Caption Markdown Validation ===');
results.forEach(r => console.log(r));
console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
