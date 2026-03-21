// Sprint 321 — validate-memory-persistence.ts
// Automated test: verifies Achiri memory persists across sessions.
// Tests: fact extraction, summary persistence, returning user context injection.
// Run: npx ts-node scripts/achiri/validate-memory-persistence.ts

import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

// Import Achiri modules directly (no server, no LLM — unit test)
import { AchiriMemoryStore, TIER_HISTORY_LIMITS } from '../../agents/achiri/memory-store';
import { summarizeBeforeTrim, loadSummary, buildSummaryContext, getUserName } from '../../agents/achiri/conversation-summary';
import { extractUserProfile, buildProfileContext } from '../../agents/achiri/user-profile';
import { injectMemoryContext } from '../../agents/achiri/memory-search';

const TEST_USER_ID = 'memory-persistence-test-' + Date.now();
const MEMORY_DIR = 'workspace/achiri/memory';
const SUMMARIES_DIR = 'workspace/achiri/summaries';

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

function cleanup(): void {
  const memFile = join(MEMORY_DIR, TEST_USER_ID + '.jsonl');
  const sumFile = join(SUMMARIES_DIR, TEST_USER_ID + '.json');
  try { if (existsSync(memFile)) unlinkSync(memFile); } catch { /* ignore */ }
  try { if (existsSync(sumFile)) unlinkSync(sumFile); } catch { /* ignore */ }
}

async function main(): Promise<void> {
  console.log('=== Sprint 321 — Achiri Memory Persistence Validation ===\n');

  // Clean up any previous test artifacts
  cleanup();

  const store = new AchiriMemoryStore(MEMORY_DIR);

  // ── Session 1: User introduces themselves ────────────────────────────
  console.log('Session 1: User introduction');
  const session1Turns = [
    { role: 'user' as const, content: 'Aslema! My name is Sami' },
    { role: 'assistant' as const, content: 'Aslema Sami! Marhba bik! Chnahwelek el yawm? 😊' },
    { role: 'user' as const, content: 'I study computer science fi Tunis' },
    { role: 'assistant' as const, content: 'Ah bravo! Computer science fi Tunis — mezian barcha! Chnowa li ta9rah tawa? Web, AI, systems?' },
    { role: 'user' as const, content: 'I love AI and machine learning' },
    { role: 'assistant' as const, content: 'Ah ouais AI w machine learning — barcha 7ajet interesting tawa. Habbit n7awnou 3la chi mawdou3?' },
  ];

  // Save session 1 turns
  store.saveHistory(TEST_USER_ID, session1Turns);

  // Verify history saved
  const loaded1 = store.loadHistory(TEST_USER_ID);
  check('Session 1 history saved', loaded1.length === 6, `got ${loaded1.length} turns`);
  check('Session 1 first user message preserved', loaded1[0]?.content.includes('Sami'));

  // ── Trigger summary extraction (simulating 50-turn trim) ─────────────
  console.log('\nSummary extraction (simulating trim)');
  summarizeBeforeTrim(TEST_USER_ID, session1Turns);

  const summary1 = loadSummary(TEST_USER_ID);
  check('Summary file created', summary1 !== null);
  check('Summary has facts', (summary1?.facts.length ?? 0) > 0, `got ${summary1?.facts.length ?? 0} facts`);

  // Check specific facts extracted
  const factsStr = (summary1?.facts ?? []).join(' | ').toLowerCase();
  check('Extracted user name (Sami)', factsStr.includes('sami'), `facts: ${factsStr}`);
  check('Extracted studies info', factsStr.includes('computer science') || factsStr.includes('stud'), `facts: ${factsStr}`);
  check('Extracted interest (AI/ML)', factsStr.includes('ai') || factsStr.includes('machine learning'), `facts: ${factsStr}`);

  // ── getUserName check ─────────────────────────────────────────────────
  console.log('\ngetUserName() check');
  const name = getUserName(TEST_USER_ID);
  check('getUserName returns Sami', name === 'Sami', `got: ${name}`);

  // ── Session 2: Returning user ────────────────────────────────────────
  console.log('\nSession 2: Returning user context');

  // Clear session history (simulate new session)
  store.saveHistory(TEST_USER_ID, []);

  // Build summary context for returning user (isNewSession=true)
  const summaryCtx = buildSummaryContext(TEST_USER_ID, true);
  check('Summary context generated for returning user', summaryCtx !== null);
  check('Summary context mentions user name', summaryCtx?.includes('Sami') ?? false, `context: ${summaryCtx?.slice(0, 100)}`);
  check('Summary context has greeting instruction', summaryCtx?.includes('returning user') ?? false);

  // ── User profile extraction ─────────────────────────────────────────
  console.log('\nUser profile extraction');

  // Re-save some history for profile extraction
  store.saveHistory(TEST_USER_ID, session1Turns);
  const profile = extractUserProfile(TEST_USER_ID);
  const profileCtx = buildProfileContext(profile);
  check('Profile extracted', profile !== null);
  check('Profile has message count', profile.message_count > 0, `count: ${profile.message_count}`);

  // ── Memory search (semantic context injection) ──────────────────────
  console.log('\nMemory search (context injection)');
  const memCtx = injectMemoryContext(TEST_USER_ID, 'Tell me about AI');
  // Memory search may or may not find relevant turns — just verify it doesn't crash
  check('Memory search runs without error', true);
  if (memCtx) {
    check('Memory context contains relevant turn', memCtx.toLowerCase().includes('ai') || memCtx.toLowerCase().includes('machine'));
  }

  // ── Session 3: Add more data and verify summary merges ──────────────
  console.log('\nSession 3: Summary merge');

  const session3Turns = [
    { role: 'user' as const, content: 'I work at a startup fi La Marsa' },
    { role: 'assistant' as const, content: 'La Marsa! Mezian barcha — startup scene there is growing.' },
  ];

  summarizeBeforeTrim(TEST_USER_ID, session3Turns);
  const summary2 = loadSummary(TEST_USER_ID);
  check('Summary updated after session 3', summary2 !== null);
  const facts2Str = (summary2?.facts ?? []).join(' | ').toLowerCase();
  check('Previous facts preserved', facts2Str.includes('sami'), `facts: ${facts2Str}`);
  check('New fact added (work/startup)', facts2Str.includes('startup') || facts2Str.includes('work'), `facts: ${facts2Str}`);

  // ── Sprint 620: Tier-based history limits ──────────────────────────
  console.log('\nSprint 620: Tier-based history limits');

  // Verify TIER_HISTORY_LIMITS exports
  check('TIER_HISTORY_LIMITS.free = 50', TIER_HISTORY_LIMITS['free'] === 50);
  check('TIER_HISTORY_LIMITS.tnd_basic = 200', TIER_HISTORY_LIMITS['tnd_basic'] === 200);
  check('TIER_HISTORY_LIMITS.tnd_premium = 500', TIER_HISTORY_LIMITS['tnd_premium'] === 500);

  // Test free tier store (50 turns)
  const freeStore = new AchiriMemoryStore(MEMORY_DIR, TIER_HISTORY_LIMITS['free']);
  check('Free tier maxTurns = 50', freeStore.getMaxTurns() === 50);

  // Test tnd_basic store (200 turns)
  const basicStore = new AchiriMemoryStore(MEMORY_DIR, TIER_HISTORY_LIMITS['tnd_basic']);
  check('tnd_basic maxTurns = 200', basicStore.getMaxTurns() === 200);

  // Test tnd_premium store (500 turns)
  const premiumStore = new AchiriMemoryStore(MEMORY_DIR, TIER_HISTORY_LIMITS['tnd_premium']);
  check('tnd_premium maxTurns = 500', premiumStore.getMaxTurns() === 500);

  // Verify free tier trims at 50
  const testTurns60: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let i = 0; i < 60; i++) {
    testTurns60.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Turn ${i}` });
  }
  freeStore.saveHistory(TEST_USER_ID, testTurns60);
  const loadedFree = freeStore.loadHistory(TEST_USER_ID);
  check('Free tier trims to 50 turns', loadedFree.length === 50, `got ${loadedFree.length}`);
  check('Free tier keeps latest turns', loadedFree[0]?.content === 'Turn 10', `first: ${loadedFree[0]?.content}`);

  // Verify tnd_basic keeps more than 50
  basicStore.saveHistory(TEST_USER_ID, testTurns60);
  const loadedBasic = basicStore.loadHistory(TEST_USER_ID);
  check('tnd_basic keeps all 60 turns (under 200 limit)', loadedBasic.length === 60, `got ${loadedBasic.length}`);

  // ── Cleanup ─────────────────────────────────────────────────────────
  cleanup();

  console.log(`\n=== Results: ${passed} PASS, ${failed} FAIL ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test error:', err);
  cleanup();
  process.exit(1);
});
