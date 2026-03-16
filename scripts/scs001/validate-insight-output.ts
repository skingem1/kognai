#!/usr/bin/env ts-node
// SCS-001 Block B — Insight Agent Integration Test
// Tests: getMockQualifiedClips() → InsightAgent.run() → InsightBrief[] validation
// Block B gate: ≥90% why_does_this_matter must pass substantive rubric

import { InsightAgent, getMockQualifiedClips, InsightBrief } from '../../agents/scs001-insight/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  ✗ FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  ✓ PASS: ' + msg); }
}

const VALID_FORMULAS    = ['curiosity_gap', 'contrarian', 'authority', 'secret'];
const GENERIC_PHRASES   = ['this is interesting', 'this is relevant', 'this matters', 'important topic', 'very interesting'];

function isGenericWhy(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return GENERIC_PHRASES.some(p => lower === p || lower.startsWith(p + '.') || lower.startsWith(p + ','));
}

async function main(): Promise<void> {
  console.log('');
  console.log('🧪 SCS-001 Insight Agent — Block B Integration Test');
  console.log('');

  // --- Mock clip setup ---
  const mockClips = getMockQualifiedClips();
  assert(mockClips.length >= 1, 'getMockQualifiedClips returns at least 1 clip');
  assert(mockClips.every(c => c.qualified === true), 'All mock clips have qualified === true');
  assert(mockClips.every(c => c.quality_score >= 20), 'All mock clips have quality_score >= 20');

  const clipIds = new Set(mockClips.map(c => c.clip_id));

  // --- Run agent ---
  const agent  = new InsightAgent();
  const briefs: InsightBrief[] = await agent.run(mockClips);

  // --- Output-level checks ---
  assert(Array.isArray(briefs), 'Output is an array');
  assert(briefs.length >= 1, 'At least 1 InsightBrief generated (got ' + briefs.length + ')');
  assert(briefs.length === mockClips.filter(c => c.qualified).length,
    'One InsightBrief per qualified clip (' + briefs.length + ')');

  let whyPassCount = 0;

  briefs.forEach((b, idx) => {
    const label = 'brief[' + idx + ']';

    // insight_id
    assert(typeof b.insight_id === 'string' && b.insight_id.startsWith('insight-'),
      label + ' insight_id starts with insight-');

    // clip_id back-link
    assert(typeof b.clip_id === 'string' && b.clip_id.length > 0,
      label + ' clip_id present');
    assert(clipIds.has(b.clip_id),
      label + ' clip_id links to valid input clip');

    // hook checks
    assert(b.hook != null && typeof b.hook === 'object',
      label + ' hook object present');
    assert(typeof b.hook.text === 'string' && b.hook.text.length > 0,
      label + ' hook.text non-empty');
    assert(b.hook.text.length <= 80,
      label + ' hook.text ≤80 chars (got ' + b.hook.text.length + ')');
    assert(VALID_FORMULAS.includes(b.hook.formula),
      label + ' hook.formula valid enum (got ' + b.hook.formula + ')');

    // commentary + statement
    assert(typeof b.pre_clip_commentary === 'string' && b.pre_clip_commentary.length <= 200,
      label + ' pre_clip_commentary ≤200 chars');
    assert(typeof b.post_clip_commentary === 'string' && b.post_clip_commentary.length <= 200,
      label + ' post_clip_commentary ≤200 chars');
    assert(typeof b.insight_statement === 'string' && b.insight_statement.length <= 200,
      label + ' insight_statement ≤200 chars');

    // constitutional field
    assert(typeof b.why_does_this_matter === 'string',
      label + ' why_does_this_matter is string');
    assert(b.why_does_this_matter.length >= 20,
      label + ' why_does_this_matter ≥20 chars (got ' + b.why_does_this_matter.length + ')');
    assert(b.why_does_this_matter.length <= 500,
      label + ' why_does_this_matter ≤500 chars');
    const whyOk = !isGenericWhy(b.why_does_this_matter);
    assert(whyOk, label + ' why_does_this_matter is substantive (not generic)');
    if (whyOk) whyPassCount++;

    // other required fields
    assert(typeof b.speaker_name === 'string' && b.speaker_name.length > 0,
      label + ' speaker_name present');
    assert(typeof b.cloud_cost_usd === 'number' && b.cloud_cost_usd >= 0,
      label + ' cloud_cost_usd is non-negative number');
    assert(typeof b.hook_formula_used === 'string' && b.hook_formula_used.length > 0,
      label + ' hook_formula_used present');
  });

  // --- Block B gate: ≥90% why_does_this_matter substantive ---
  const whyPassRate = briefs.length > 0 ? whyPassCount / briefs.length : 0;
  assert(whyPassRate >= 0.9,
    'Block B gate: ≥90% why_does_this_matter substantive (' + (whyPassRate * 100).toFixed(0) + '% passed)');

  const totalCost = briefs.reduce((sum, b) => sum + b.cloud_cost_usd, 0);
  console.log('');
  console.log('💰 Total cloud cost: $' + totalCost.toFixed(4));

  const code = process.exitCode === 1 ? 1 : 0;
  console.log(code === 0 ? '✅ All checks passed — Block B gate: PASS' : '❌ Some checks failed');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });