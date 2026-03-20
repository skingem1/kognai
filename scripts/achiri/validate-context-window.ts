// validate-context-window.ts — Sprint 306
// Validates the token-budget context window selector.
// Run: npx ts-node scripts/achiri/validate-context-window.ts

import { estimateTokens, getTokenBudget, selectTurnsWithinBudget } from '../../agents/achiri/context-window';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean): void {
  try {
    const ok = fn();
    if (ok) { console.log('  PASS  ' + name); passed++; }
    else    { console.log('  FAIL  ' + name); failed++; }
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err as Error).message);
    failed++;
  }
}

console.log('\n=== Sprint 306: Context Window Validation ===\n');

// Helper to create turns
function makeTurns(count: number, msgLen: number = 200): Array<{ role: 'user' | 'assistant'; content: string }> {
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let i = 0; i < count; i++) {
    turns.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'Message ' + i + ' ' + 'x'.repeat(msgLen),
    });
  }
  return turns;
}

// Test 1: estimateTokens basic
test('estimateTokens returns correct estimate', () => {
  const tokens = estimateTokens('Hello world!'); // 12 chars → 3 tokens
  return tokens === 3;
});

// Test 2: getTokenBudget returns known budget
test('getTokenBudget returns 1500 for qwen3:0.6b', () => {
  return getTokenBudget('qwen3:0.6b') === 1500;
});

// Test 3: getTokenBudget returns default for unknown model
test('getTokenBudget returns default 3000 for unknown model', () => {
  return getTokenBudget('some-unknown-model') === 3000;
});

// Test 4: Small history passes through unchanged
test('Small history (5 turns) passes through unchanged', () => {
  const turns = makeTurns(5, 50); // 5 turns × ~60 chars ≈ ~75 tokens, well under budget
  const result = selectTurnsWithinBudget(turns, 'qwen3:14b');
  return result.length === 5;
});

// Test 5: Large history gets trimmed for small model
test('50 turns get trimmed for qwen3:0.6b (1500 token budget)', () => {
  const turns = makeTurns(50, 200); // 50 × ~210 chars ≈ ~2625 tokens > 1500
  const result = selectTurnsWithinBudget(turns, 'qwen3:0.6b');
  return result.length < 50 && result.length >= 6; // At least RECENCY_MIN
});

// Test 6: Recent turns are always preserved
test('Most recent 6 turns are always included', () => {
  const turns = makeTurns(50, 200);
  const result = selectTurnsWithinBudget(turns, 'qwen3:0.6b');
  // Last 6 turns from original should be the last 6 in result
  const origLast6 = turns.slice(-6).map(t => t.content);
  const resultLast6 = result.slice(-6).map(t => t.content);
  return JSON.stringify(origLast6) === JSON.stringify(resultLast6);
});

// Test 7: Empty history returns empty
test('Empty history returns empty array', () => {
  const result = selectTurnsWithinBudget([], 'qwen3:4b');
  return result.length === 0;
});

// Test 8: Turn order is preserved
test('Turn order is preserved after windowing', () => {
  const turns = makeTurns(30, 150);
  const result = selectTurnsWithinBudget(turns, 'qwen3:0.6b');
  // Check that roles alternate correctly
  for (let i = 0; i < result.length - 1; i++) {
    const msgNum = parseInt(result[i].content.match(/Message (\d+)/)?.[1] ?? '-1');
    const nextNum = parseInt(result[i + 1].content.match(/Message (\d+)/)?.[1] ?? '-1');
    if (nextNum <= msgNum) return false;
  }
  return true;
});

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
if (failed > 0) { console.log('\nFAILED'); process.exit(1); }
console.log('\nALL PASS');
