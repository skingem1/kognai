#!/usr/bin/env ts-node
// Sprint 258 — Launch Strategy Validation

import { generateStrategy, generateManifesto, generateCalendar } from './tiktok-launch-strategy';
import { generateNarrative } from './brand-narrative';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

function main(): void {
  console.log('');
  console.log('📱  Sprint 258 — Launch Strategy Validation');
  console.log('');

  // --- Test 1: Manifesto generation ---
  console.log('Test 1: Manifesto');
  const manifesto = generateManifesto();
  assert(manifesto.length === 15, '15 manifesto posts: ' + manifesto.length);

  for (const post of manifesto) {
    assert(post.hook.length <= 80, '#' + post.post_number + ' hook <= 80 chars: ' + post.hook.length);
    assert(post.hashtags.length >= 3 && post.hashtags.length <= 5, '#' + post.post_number + ' 3-5 hashtags: ' + post.hashtags.length);
    assert(post.estimated_duration_sec >= 15 && post.estimated_duration_sec <= 60, '#' + post.post_number + ' duration 15-60s: ' + post.estimated_duration_sec);
    assert(['curiosity_gap', 'contrarian', 'authority', 'secret'].includes(post.hook_formula), '#' + post.post_number + ' valid formula: ' + post.hook_formula);
  }

  // Check day distribution: 8 days, 2 posts per day (except some with 1)
  const dayMap = new Map<number, number>();
  for (const post of manifesto) {
    dayMap.set(post.day, (dayMap.get(post.day) || 0) + 1);
  }
  assert(dayMap.size >= 7, 'Posts spread across 7+ days: ' + dayMap.size);

  // --- Test 2: Calendar generation ---
  console.log('\nTest 2: Content Calendar');
  const calendar = generateCalendar('2026-04-08');
  assert(calendar.length >= 24, 'At least 24 calendar entries: ' + calendar.length);

  const calendarDates = new Set(calendar.map(c => c.date));
  assert(calendarDates.size === 8, '8 unique dates: ' + calendarDates.size);

  const manifestoPosts = calendar.filter(c => c.post_type === 'manifesto');
  assert(manifestoPosts.length === 15, '15 manifesto entries in calendar: ' + manifestoPosts.length);

  const slots = new Set(calendar.map(c => c.slot));
  assert(slots.size === 4, '4 time slots used: ' + [...slots].join(', '));

  // --- Test 3: Full strategy ---
  console.log('\nTest 3: Full strategy');
  const strategy = generateStrategy();
  assert(strategy.window_start === '2026-04-08', 'Start: ' + strategy.window_start);
  assert(strategy.window_end === '2026-04-15', 'End: ' + strategy.window_end);
  assert(strategy.kill_switch_posts === 30, 'Kill switch posts: ' + strategy.kill_switch_posts);
  assert(strategy.kill_switch_views === 500, 'Kill switch views: ' + strategy.kill_switch_views);
  assert(strategy.brand_pillars.length === 5, 'Brand pillars: ' + strategy.brand_pillars.length);
  assert(strategy.target_audiences.length === 5, 'Target audiences: ' + strategy.target_audiences.length);

  // --- Test 4: Brand narrative ---
  console.log('\nTest 4: Brand narrative');
  const narrative = generateNarrative();
  assert(narrative.one_liner.length > 50, 'One-liner has substance: ' + narrative.one_liner.length + ' chars');
  assert(narrative.elevator_pitch.length > 100, 'Elevator pitch has substance: ' + narrative.elevator_pitch.length + ' chars');
  assert(narrative.manifesto_opening.length > 100, 'Manifesto opening: ' + narrative.manifesto_opening.length + ' chars');
  assert(narrative.differentiators.length >= 5, 'Differentiators: ' + narrative.differentiators.length);
  assert(narrative.anti_positioning.length >= 3, 'Anti-positioning: ' + narrative.anti_positioning.length);
  assert(narrative.proof_points.length >= 4, 'Proof points: ' + narrative.proof_points.length);
  assert(narrative.voice_guidelines.tone.length >= 3, 'Voice tones: ' + narrative.voice_guidelines.tone.length);
  assert(narrative.voice_guidelines.avoid.length >= 3, 'Voice avoid: ' + narrative.voice_guidelines.avoid.length);
  assert(narrative.voice_guidelines.example_hooks.length >= 3, 'Example hooks: ' + narrative.voice_guidelines.example_hooks.length);

  // Vocabulary substitutions
  const vocab = narrative.voice_guidelines.vocabulary;
  assert(vocab['AI tool'] === 'AI civilisation', 'AI tool → AI civilisation');
  assert(vocab['chatbot'] === 'agent', 'chatbot → agent');

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 258 — Launch Strategy — ALL PASS');
  } else {
    console.log('❌ Sprint 258 — ' + failed + ' tests FAILED');
  }
}

main();
