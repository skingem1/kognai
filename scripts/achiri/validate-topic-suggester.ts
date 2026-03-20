// validate-topic-suggester.ts — Sprint 309
// Validates topic suggestion + stall detection.
// Run: npx ts-node scripts/achiri/validate-topic-suggester.ts

import { isStallMessage, suggestTopics, buildTopicHint } from '../../agents/achiri/topic-suggester';
import type { UserProfile } from '../../agents/achiri/user-profile';

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

console.log('\n=== Sprint 309: Topic Suggester Validation ===\n');

// Test 1: Detects "bored" as stall
test('isStallMessage detects "bored"', () => isStallMessage('bored'));

// Test 2: Detects "idk" as stall
test('isStallMessage detects "idk"', () => isStallMessage('idk'));

// Test 3: Detects "meh" as stall
test('isStallMessage detects "meh"', () => isStallMessage('meh'));

// Test 4: Detects Darija stall
test('isStallMessage detects "walou"', () => isStallMessage('walou'));

// Test 5: Detects greeting as stall (short greetings get suggestions)
test('isStallMessage detects "aslema"', () => isStallMessage('aslema'));

// Test 6: Normal message is NOT a stall
test('isStallMessage rejects normal message', () => !isStallMessage('Can you help me understand quantum physics?'));

// Test 7: Long message is NOT a stall
test('isStallMessage rejects long message', () => !isStallMessage('I had a really interesting day at school today and I wanted to tell you about it'));

// Test 8: suggestTopics returns suggestions for profile with interests
test('suggestTopics returns 2+ suggestions for profile with interests', () => {
  const profile: UserProfile = {
    userId: 'test',
    preferred_language: 'darija',
    dialect: 'tunisian',
    formality: 'informal',
    dialect_confidence: 0.8,
    top_interests: ['technology', 'education', 'food'],
    message_count: 50,
    first_seen: '2026-03-01',
    last_seen: '2026-03-20',
    avg_message_length: 30,
  };
  const topics = suggestTopics(profile);
  return topics.length >= 2;
});

// Test 9: suggestTopics returns default suggestions for null profile
test('suggestTopics returns defaults for null profile', () => {
  const topics = suggestTopics(null);
  return topics.length >= 2;
});

// Test 10: buildTopicHint returns hint for stall message
test('buildTopicHint returns non-empty for "bored"', () => {
  const hint = buildTopicHint('bored', null);
  return hint.length > 0 && hint.includes('Conversation Engagement');
});

// Test 11: buildTopicHint returns empty for normal message
test('buildTopicHint returns empty for normal message', () => {
  const hint = buildTopicHint('Tell me about the history of Tunisia', null);
  return hint === '';
});

// Test 12: buildTopicHint includes suggested topics
test('buildTopicHint includes topic list', () => {
  const hint = buildTopicHint('idk', null);
  return hint.includes('- ');
});

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
if (failed > 0) { console.log('\nFAILED'); process.exit(1); }
console.log('\nALL PASS');
