#!/usr/bin/env npx ts-node
/**
 * validate-youtube-quota.ts — Sprint 682
 * Validates YouTube API quota guard + search result caching.
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

const ytSrc = fs.readFileSync(path.join(ROOT, 'agents', 'scs001-discovery', 'youtube-search.ts'), 'utf-8');

// Test 1: Quota guard exists
check('has-quota-path', ytSrc.includes('youtube-quota.json'), 'Quota state file defined');
check('has-max-daily', ytSrc.includes('MAX_DAILY_REQUESTS'), 'Max daily requests limit defined');
check('has-quota-check', ytSrc.includes('isQuotaExhausted'), 'Quota exhaustion check exists');
check('has-increment', ytSrc.includes('incrementQuota'), 'Quota increment after request');
check('quota-limit-80', ytSrc.includes('= 80'), 'Limit set to 80 (leaves buffer)');

// Test 2: Cache exists
check('has-cache-path', ytSrc.includes('youtube-search-cache.json'), 'Cache file defined');
check('has-cache-get', ytSrc.includes('getCachedResult'), 'Cache retrieval function');
check('has-cache-set', ytSrc.includes('setCachedResult'), 'Cache storage function');
check('has-cache-ttl', ytSrc.includes('CACHE_TTL_MS'), 'Cache TTL defined');
check('cache-hit-log', ytSrc.includes('Cache hit'), 'Logs cache hits');

// Test 3: 403 handling
check('handles-403', ytSrc.includes('response.status === 403'), 'Handles 403 quota exceeded');
check('stops-on-403', ytSrc.includes('count: MAX_DAILY_REQUESTS'), 'Sets quota to max on 403');

// Test 4: getQuotaUsage static method
check('has-quota-usage', ytSrc.includes('getQuotaUsage'), 'Static quota usage method exists');

// Test 5: Exports are preserved
check('exports-class', ytSrc.includes('export class YouTubeSearchProvider'), 'Class is exported');
check('exports-interface', ytSrc.includes('export interface YouTubeSearchResult'), 'Interface is exported');

console.log('\n=== YouTube Quota Guard Validation ===');
results.forEach(r => console.log(r));
console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
