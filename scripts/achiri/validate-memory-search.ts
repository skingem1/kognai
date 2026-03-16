// Sprint 128 — validate-memory-search.ts
// 5 validation checks for the achiri-memory T3 skill.
// Run: npx ts-node scripts/achiri/validate-memory-search.ts

import * as path from 'path';
import * as fs from 'fs';
import { AchiriMemoryStore } from '../../agents/achiri/memory-store';
import { searchMemory, getMemorySummary, injectMemoryContext } from '../../agents/achiri/memory-search';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

const TEST_USER = 'validate-memory-search-test-user';
const STORE_PATH = 'workspace/achiri/memory';

function seedHistory(): void {
  const store = new AchiriMemoryStore(STORE_PATH);
  store.clearHistory(TEST_USER);
  // Seed 6 turns with known content
  store.appendTurn(TEST_USER, { role: 'user', content: 'Ana n7eb football barsha, wa n3ayesh fi Tunis' });
  store.appendTurn(TEST_USER, { role: 'assistant', content: 'Mrigoul! Football fi Tunis 3andi7 — Espérance walla Club Africain?' });
  store.appendTurn(TEST_USER, { role: 'user', content: 'Espérance bien sur! Elترجي el a7sen' });
  store.appendTurn(TEST_USER, { role: 'assistant', content: 'Sahbi el karma!' });
  store.appendTurn(TEST_USER, { role: 'user', content: 'Nheb ki n9ra programming khsous Python w TypeScript' });
  store.appendTurn(TEST_USER, { role: 'assistant', content: 'TypeScript 3andha type safety — choice mrigoul' });
}

function cleanHistory(): void {
  const store = new AchiriMemoryStore(STORE_PATH);
  store.clearHistory(TEST_USER);
}

async function main(): Promise<void> {
  console.log('=== Sprint 128 — Memory Search T3 Skill Validation ===\n');

  seedHistory();

  // Check 1: searchMemory finds relevant turn by keyword overlap
  console.log('Check 1: searchMemory finds relevant turn by keyword "football"');
  const r1 = searchMemory(TEST_USER, 'football', 3);
  check('at least 1 result found', r1.length >= 1, `found ${r1.length} results`);
  check('top result contains football keyword', r1[0]?.turn.content.toLowerCase().includes('football'), r1[0]?.turn.content.slice(0, 60));
  check('top result score > 0', (r1[0]?.score ?? 0) > 0, `score=${r1[0]?.score}`);

  // Check 2: searchMemory returns topK results sorted by score desc
  console.log('\nCheck 2: searchMemory returns results sorted by score descending');
  const r2 = searchMemory(TEST_USER, 'TypeScript programming', 5);
  check('at least 1 result for programming query', r2.length >= 1, `found ${r2.length}`);
  if (r2.length >= 2) {
    check('results sorted by score desc', r2[0].score >= r2[1].score, `scores: ${r2[0].score.toFixed(2)} >= ${r2[1].score.toFixed(2)}`);
  } else {
    passed++; // only 1 result, inherently sorted
    console.log('  PASS  only 1 result (inherently sorted)');
  }

  // Check 3: getMemorySummary returns string with topic info
  console.log('\nCheck 3: getMemorySummary returns summary with topic data');
  const summary = getMemorySummary(TEST_USER);
  check('summary is a non-empty string', typeof summary === 'string' && summary.length > 0, summary);
  check('summary mentions message count', /\d+ messages/.test(summary), summary);

  // Check 4: injectMemoryContext returns null for empty history
  console.log('\nCheck 4: injectMemoryContext returns null for unknown user (empty history)');
  const ctx4 = injectMemoryContext('user-who-never-chatted', 'football', 3);
  check('null for empty history', ctx4 === null, String(ctx4));

  // Check 5: injectMemoryContext returns context block when relevant history exists
  console.log('\nCheck 5: injectMemoryContext returns context block for football query');
  const ctx5 = injectMemoryContext(TEST_USER, 'football Tunisia', 3);
  check('non-null context block returned', ctx5 !== null, 'got null');
  check('context block contains previous conversation reference', ctx5?.includes('previous') ?? false, (ctx5 ?? '').slice(0, 80));
  check('context block contains actual turn excerpt', ctx5?.includes('football') ?? false, (ctx5 ?? '').slice(0, 120));

  cleanHistory();

  console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
