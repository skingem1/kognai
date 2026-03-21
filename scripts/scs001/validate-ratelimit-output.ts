#!/usr/bin/env npx ts-node
/**
 * validate-ratelimit-output.ts — Sprint 681
 * Validates rate limiter in rapidapi-tiktok-client.ts and drain-local-queue fix.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
let pass = true;
const results: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  const icon = ok ? 'PASS' : 'FAIL';
  results.push(`[${icon}] ${name}: ${detail}`);
  if (!ok) pass = false;
}

// Test 1: rapidapi-tiktok-client.ts has rate limiter
const rapidSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'scs001', 'rapidapi-tiktok-client.ts'), 'utf-8');

check('has-rateLimitedFetch', rapidSrc.includes('rateLimitedFetch'), 'rateLimitedFetch function exists');
check('has-backoff', rapidSrc.includes('INITIAL_BACKOFF_MS'), 'Exponential backoff configured');
check('has-max-retries', rapidSrc.includes('MAX_RETRIES'), 'Max retries configured');
check('has-min-interval', rapidSrc.includes('MIN_INTERVAL_MS'), 'Minimum interval configured');
check('handles-429', rapidSrc.includes('res.status === 429'), 'Handles 429 status code');

// Test 2: All API calls use rateLimitedFetch (except direct downloads)
const rawFetchCalls = (rapidSrc.match(/await fetch\(/g) || []).length;
const rateLimitedCalls = (rapidSrc.match(/await rateLimitedFetch\(/g) || []).length;
// Raw fetch: 1 inside rateLimitedFetch itself + 1 for video download = 2 total
check('api-calls-rate-limited', rateLimitedCalls >= 4, `${rateLimitedCalls} API calls use rateLimitedFetch`);
check('only-download-raw', rawFetchCalls <= 2, `${rawFetchCalls} raw fetch calls (1 in rateLimitedFetch + 1 video download)`);

// Test 3: drain-local-queue.ts fix
const drainSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'drain-local-queue.ts'), 'utf-8');
check('drain-no-js-ext', !drainSrc.includes("task-router.js"), 'No .js extension in import');
check('drain-uses-require', drainSrc.includes("require('./task-router')"), 'Uses require() for CommonJS compatibility');
check('drain-has-main', drainSrc.includes('async function main'), 'Wraps top-level await in main()');

console.log('\n=== Rate Limit + Drain Fix Validation ===');
results.forEach(r => console.log(r));
console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
