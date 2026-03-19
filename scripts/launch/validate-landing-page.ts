#!/usr/bin/env ts-node
// Sprint 259 — Landing Page Validation

import { readFileSync, existsSync } from 'fs';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); failed++; process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); passed++; }
}

function main(): void {
  console.log('');
  console.log('🌐  Sprint 259 — Landing Page Validation');
  console.log('');

  const pagePath = 'landing/index.html';

  // --- Test 1: File exists ---
  console.log('Test 1: File exists');
  assert(existsSync(pagePath), 'landing/index.html exists');

  const html = readFileSync(pagePath, 'utf8');

  // --- Test 2: HTML structure ---
  console.log('\nTest 2: HTML structure');
  assert(html.includes('<!DOCTYPE html>'), 'Has DOCTYPE');
  assert(html.includes('<html lang="en">'), 'Has lang attribute');
  assert(html.includes('<meta charset="UTF-8">'), 'Has charset');
  assert(html.includes('<meta name="viewport"'), 'Has viewport meta');
  assert(html.includes('<title>'), 'Has title');
  assert(html.includes('</html>'), 'Valid closing tag');

  // --- Test 3: SEO & Open Graph ---
  console.log('\nTest 3: SEO');
  assert(html.includes('<meta name="description"'), 'Has meta description');
  assert(html.includes('og:title'), 'Has og:title');
  assert(html.includes('og:description'), 'Has og:description');
  assert(html.includes('og:type'), 'Has og:type');

  // --- Test 4: Brand content ---
  console.log('\nTest 4: Brand content');
  assert(html.includes('Kognai'), 'Mentions Kognai');
  assert(html.includes('sovereign'), 'Uses sovereign messaging');
  assert(html.includes('civilisation'), 'Uses civilisation framing');
  assert(html.includes('AI agents'), 'Mentions AI agents');
  assert(html.includes('constitution'), 'Mentions constitution');

  // --- Test 5: Required sections ---
  console.log('\nTest 5: Required sections');
  assert(html.includes('hero'), 'Has hero section');
  assert(html.includes('waitlist'), 'Has waitlist form');
  assert(html.includes('type="email"'), 'Has email input');
  assert(html.includes('<button'), 'Has submit button');
  assert(html.includes('mission'), 'Has mission section');
  assert(html.includes('footer'), 'Has footer');

  // --- Test 6: Stats ---
  console.log('\nTest 6: Stats');
  assert(html.includes('28'), 'Shows 28 agents');
  assert(html.includes('250+'), 'Shows 250+ sprints');
  assert(html.includes('$0'), 'Shows $0 cloud cost');

  // --- Test 7: No external dependencies ---
  console.log('\nTest 7: Self-contained');
  const hasExternalCSS = html.includes('href="http') && html.includes('.css');
  const hasExternalJS = html.includes('src="http') && html.includes('.js');
  assert(!hasExternalCSS, 'No external CSS (inline styles)');
  assert(!hasExternalJS, 'No external JS dependencies');

  // --- Test 8: File size ---
  console.log('\nTest 8: Performance');
  const sizeKB = html.length / 1024;
  assert(sizeKB < 20, 'Page under 20KB: ' + sizeKB.toFixed(1) + 'KB');
  assert(sizeKB > 2, 'Page has content (> 2KB): ' + sizeKB.toFixed(1) + 'KB');

  // --- Test 9: Pillars ---
  console.log('\nTest 9: Feature pillars');
  assert(html.includes('Constitutional Governance'), 'Pillar: Constitutional Governance');
  assert(html.includes('Agent Economy'), 'Pillar: Agent Economy');
  assert(html.includes('Cost Sovereign'), 'Pillar: Cost Sovereign');
  assert(html.includes('Episodic Memory'), 'Pillar: Episodic Memory');
  assert(html.includes('Multi-Platform'), 'Pillar: Multi-Platform');
  assert(html.includes('12-Stage Pipeline'), 'Pillar: 12-Stage Pipeline');

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
  if (failed === 0) {
    console.log('✅ Sprint 259 — Landing Page — ALL PASS');
  } else {
    console.log('❌ Sprint 259 — ' + failed + ' tests FAILED');
  }
}

main();
