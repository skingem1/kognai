#!/usr/bin/env npx ts-node
/**
 * score-promo.ts — Sprint TICKET-008-PROMO-05
 *
 * Scores a PromoScript for hook strength and CTA clarity.
 * Gate: average score >= 70.
 *
 * Hook strength criteria (0-100):
 *   +30: starts with question, number, or "Did you"
 *   +25: contains power word (transform, game-changer, finally, stop, tired, shocking)
 *   +25: contains urgency/claim word (never, always, secret, only, guaranteed, proven)
 *   +20: length 8-15 words (optimal for hook)
 *
 * CTA clarity criteria (0-100):
 *   +40: contains action verb (get, order, shop, buy, grab, try, click, tap, swipe)
 *   +30: contains urgency word (today, now, limited, link, bio, below)
 *   +30: length 5-12 words (short & punchy)
 *
 * Usage:
 *   npx ts-node scripts/promo/score-promo.ts --job-id <id>
 *   npx ts-node scripts/promo/score-promo.ts --dry-run
 *
 * Exit 0 = PASS (avg >= 70), Exit 1 = FAIL
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateScript } from './promo-scriptgen';
import { PromoScript } from './promo-scriptgen';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');

const HOOK_POWER_WORDS = ['transform', 'game-changer', 'finally', 'stop', 'tired', 'shocking', 'never', 'secret', 'revolutionary', 'amazing', 'incredible', 'breakthrough'];
const HOOK_CLAIM_WORDS = ['always', 'only', 'guaranteed', 'proven', 'best', 'fastest', 'ultimate', 'exclusive', '#1'];
const CTA_ACTION_VERBS = ['get', 'order', 'shop', 'buy', 'grab', 'try', 'click', 'tap', 'swipe', 'visit', 'check'];
const CTA_URGENCY = ['today', 'now', 'limited', 'link', 'bio', 'below', 'instantly', 'free'];

export interface ScoreResult {
  hookScore: number;
  ctaScore: number;
  avgScore: number;
  hookText: string;
  ctaText: string;
  hookBreakdown: Record<string, boolean>;
  ctaBreakdown: Record<string, boolean>;
  pass: boolean;
}

export function scoreScript(script: PromoScript): ScoreResult {
  const hookBeat = script.beats.find(b => b.beat === 'hook');
  const ctaBeat = script.beats.find(b => b.beat === 'cta');

  const hookText = hookBeat?.text || '';
  const ctaText = ctaBeat?.text || '';

  const hookLower = hookText.toLowerCase();
  const ctaLower = ctaText.toLowerCase();
  const hookWords = hookText.trim().split(/\s+/).length;
  const ctaWords = ctaText.trim().split(/\s+/).length;

  // Hook scoring
  const hookBreakdown = {
    starts_with_question_number_or_did: /^(did you|[0-9]|\?|what if|why |how |when )/i.test(hookText),
    contains_power_word: HOOK_POWER_WORDS.some(w => hookLower.includes(w)),
    contains_urgency_claim: HOOK_CLAIM_WORDS.some(w => hookLower.includes(w)),
    optimal_length_8_15: hookWords >= 8 && hookWords <= 15,
  };
  const hookScore =
    (hookBreakdown.starts_with_question_number_or_did ? 30 : 0) +
    (hookBreakdown.contains_power_word ? 25 : 0) +
    (hookBreakdown.contains_urgency_claim ? 25 : 0) +
    (hookBreakdown.optimal_length_8_15 ? 20 : 0);

  // CTA scoring
  const ctaBreakdown = {
    contains_action_verb: CTA_ACTION_VERBS.some(v => ctaLower.includes(v)),
    contains_urgency: CTA_URGENCY.some(u => ctaLower.includes(u)),
    optimal_length_5_12: ctaWords >= 5 && ctaWords <= 12,
  };
  const ctaScore =
    (ctaBreakdown.contains_action_verb ? 40 : 0) +
    (ctaBreakdown.contains_urgency ? 30 : 0) +
    (ctaBreakdown.optimal_length_5_12 ? 30 : 0);

  const avgScore = Math.round((hookScore + ctaScore) / 2);

  return {
    hookScore,
    ctaScore,
    avgScore,
    hookText,
    ctaText,
    hookBreakdown,
    ctaBreakdown,
    pass: avgScore >= 70,
  };
}

function printScore(jobId: string, score: ScoreResult) {
  const icon = score.pass ? '✅' : '❌';
  console.log(`${icon} ${jobId} — avg ${score.avgScore}/100 ${score.pass ? 'PASS' : 'FAIL'}`);
  console.log(`   Hook (${score.hookScore}/100): "${score.hookText.slice(0, 80)}"`);
  for (const [k, v] of Object.entries(score.hookBreakdown)) console.log(`     ${v ? '✓' : '✗'} ${k}`);
  console.log(`   CTA  (${score.ctaScore}/100): "${score.ctaText.slice(0, 80)}"`);
  for (const [k, v] of Object.entries(score.ctaBreakdown)) console.log(`     ${v ? '✓' : '✗'} ${k}`);
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jobIdIdx = args.indexOf('--job-id');
  const jobIdArg = jobIdIdx !== -1 ? args[jobIdIdx + 1] : null;

  console.log('═══════════════════════════════════════════════════');
  console.log('  PROMO-05 SCORER — hook strength + CTA clarity');
  console.log('═══════════════════════════════════════════════════\n');

  if (jobIdArg) {
    const scriptPath = join(PROMO_JOBS_DIR, jobIdArg, 'script.json');
    if (!existsSync(scriptPath)) { console.error(`❌ script.json not found: ${scriptPath}`); process.exit(1); }
    const script: PromoScript = JSON.parse(readFileSync(scriptPath, 'utf8'));
    const score = scoreScript(script);
    printScore(jobIdArg, score);
    process.exit(score.pass ? 0 : 1);
  }

  if (dryRun) {
    // Score 10 mock scripts across different tones/products
    const testCases = [
      { id: 'score-electronics', name: 'Wireless Earbuds', price: '$79', tone: 'enthusiastic' as const },
      { id: 'score-beauty',      name: 'Anti-Aging Serum',  price: '$45', tone: 'professional' as const },
      { id: 'score-fitness',     name: 'Resistance Bands',  price: '$25', tone: 'enthusiastic' as const },
      { id: 'score-kitchen',     name: 'Air Fryer 5.8Qt',   price: '$89', tone: 'conversational' as const },
      { id: 'score-skincare',    name: 'Vitamin C Serum',   price: '$35', tone: 'enthusiastic' as const },
      { id: 'score-tech',        name: 'Smart Watch',       price: '$199', tone: 'professional' as const },
      { id: 'score-home',        name: 'Robot Vacuum',      price: '$299', tone: 'enthusiastic' as const },
      { id: 'score-fashion',     name: 'Leather Wallet',    price: '$49', tone: 'conversational' as const },
      { id: 'score-wellness',    name: 'Collagen Powder',   price: '$39', tone: 'enthusiastic' as const },
      { id: 'score-office',      name: 'Standing Desk Mat', price: '$59', tone: 'conversational' as const },
    ];

    const scores: ScoreResult[] = [];
    for (const tc of testCases) {
      const jobDir = join(PROMO_JOBS_DIR, tc.id);
      mkdirSync(jobDir, { recursive: true });
      const mockProduct = {
        name: tc.name, brand: 'BestBrand', price: tc.price,
        description: 'Top-rated product with thousands of verified reviews.',
        bulletPoints: ['Premium Quality', 'Money-Back Guarantee', 'Fast Shipping'],
        images: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
        rating: '4.8', reviewCount: '8,543 reviews', topReviews: ['Amazing!', 'Life-changing.'],
        category: 'Consumer', url: 'https://example.com',
      };
      writeFileSync(join(jobDir, 'product.json'), JSON.stringify(mockProduct, null, 2));
      const r = await generateScript(tc.id, tc.tone, true);
      if (!r.ok || !r.script) { console.error(`Failed: ${tc.id}`); continue; }
      scores.push(scoreScript(r.script));
    }

    console.log('── Results ──────────────────────────────────────\n');
    let passCount = 0;
    for (let i = 0; i < scores.length; i++) {
      printScore(testCases[i].id, scores[i]);
      if (scores[i].pass) passCount++;
    }

    const avgTotal = Math.round(scores.reduce((s, r) => s + r.avgScore, 0) / scores.length);
    const hookAvg = Math.round(scores.reduce((s, r) => s + r.hookScore, 0) / scores.length);
    const ctaAvg = Math.round(scores.reduce((s, r) => s + r.ctaScore, 0) / scores.length);
    const passRate = Math.round((passCount / scores.length) * 100);

    console.log('═══════════════════════════════════════════════════');
    console.log(`Batch: ${passCount}/${scores.length} PASS (${passRate}%)`);
    console.log(`Avg hook: ${hookAvg}/100 | Avg CTA: ${ctaAvg}/100 | Avg total: ${avgTotal}/100`);
    if (passRate >= 70) {
      console.log('✅ GATE PASS — Hook strength >= 70% batch pass rate');
    } else {
      console.log('❌ GATE FAIL — Hook strength below threshold');
    }
    console.log('═══════════════════════════════════════════════════');
    process.exit(passRate >= 70 ? 0 : 1);
  }

  console.error('Usage: --dry-run | --job-id <id>');
  process.exit(1);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
