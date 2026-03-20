// validate-emotion-detector.ts — Sprint 307
// Validates emotion detection + mood hint injection.
// Run: npx ts-node scripts/achiri/validate-emotion-detector.ts

import { detectEmotion, getMoodHint } from '../../agents/achiri/emotion-detector';

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

console.log('\n=== Sprint 307: Emotion Detector Validation ===\n');

// Test 1: Detects sadness (English)
test('Detects sadness — "I feel so sad today"', () => {
  const r = detectEmotion('I feel so sad today, nothing is going right');
  return r.mood === 'sad' && r.confidence > 0;
});

// Test 2: Detects sadness (Darija)
test('Detects sadness — Darija "7zin barcha"', () => {
  const r = detectEmotion('ena 7zin barcha, maranich mlih');
  return r.mood === 'sad' && r.confidence > 0;
});

// Test 3: Detects happiness (English)
test('Detects happiness — "I am so happy!"', () => {
  const r = detectEmotion('I am so happy, this is amazing!');
  return r.mood === 'happy' && r.confidence > 0;
});

// Test 4: Detects happiness (Darija)
test('Detects happiness — Darija "far7an"', () => {
  const r = detectEmotion('far7an barcha el yawm, hamdullah');
  return r.mood === 'happy' && r.confidence > 0;
});

// Test 5: Detects stress
test('Detects stress — "I am so stressed about exams"', () => {
  const r = detectEmotion('I am so stressed about my exams, can\'t sleep');
  return r.mood === 'stressed' && r.confidence > 0;
});

// Test 6: Detects anger
test('Detects anger — "I am furious"', () => {
  const r = detectEmotion('I am furious, this is so unfair and I hate it');
  return r.mood === 'angry' && r.confidence > 0;
});

// Test 7: Detects gratitude
test('Detects gratitude — "barak allah fik"', () => {
  const r = detectEmotion('barak allah fik, merci barcha');
  return r.mood === 'grateful' && r.confidence > 0;
});

// Test 8: Detects loneliness
test('Detects loneliness — "I feel so lonely"', () => {
  const r = detectEmotion('I feel so lonely, nobody understands me');
  return r.mood === 'lonely' && r.confidence > 0;
});

// Test 9: Neutral for normal messages
test('Neutral for everyday message — "What time is it?"', () => {
  const r = detectEmotion('What time is it? Can you help me with homework?');
  return r.mood === 'neutral';
});

// Test 10: Mood hints exist for non-neutral moods
test('getMoodHint returns non-empty for sad', () => {
  return getMoodHint('sad').length > 0;
});

// Test 11: Mood hint is empty for neutral
test('getMoodHint returns empty for neutral', () => {
  return getMoodHint('neutral') === '';
});

// Test 12: French sadness detection
test('Detects sadness — French "je suis triste"', () => {
  const r = detectEmotion('je suis triste, ça va pas du tout');
  return r.mood === 'sad' && r.confidence > 0;
});

// Test 13: Confidence is 0–1
test('Confidence is within 0-1 range', () => {
  const r = detectEmotion('I am devastated and heartbroken and crying and so sad');
  return r.confidence >= 0 && r.confidence <= 1;
});

console.log('\n--- Results: ' + passed + ' passed, ' + failed + ' failed ---');
if (failed > 0) { console.log('\nFAILED'); process.exit(1); }
console.log('\nALL PASS');
