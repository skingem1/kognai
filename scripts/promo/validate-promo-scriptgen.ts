#!/usr/bin/env npx ts-node
/**
 * validate-promo-scriptgen.ts — Sprint TICKET-008-PROMO-02
 *
 * Gate validator for TICKET-008-PROMO-02:
 *   - 7-beat AIDA structure (all 7 beats present in correct order)
 *   - image_index values within bounds (null or 0..images.length-1)
 *   - total duration 45-65 seconds
 *
 * Usage:
 *   # Dry-run: generate + validate using mock ProductData
 *   npx ts-node scripts/promo/validate-promo-scriptgen.ts --dry-run
 *
 *   # Validate existing script.json:
 *   npx ts-node scripts/promo/validate-promo-scriptgen.ts --job-id <id>
 *
 * Exit 0 = PASS, Exit 1 = FAIL
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateScript, PromoScript } from './promo-scriptgen';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');
const AIDA_ORDER = ['hook', 'problem', 'solution', 'benefit1', 'benefit2', 'proof', 'cta'];

interface GateResult {
  jobId: string;
  pass: boolean;
  checks: Record<string, { pass: boolean; detail: string }>;
}

function validateScript(script: PromoScript, imageCount: number): GateResult {
  const beats = script.beats || [];
  const beatNames = beats.map((b) => b.beat);

  const has7Beats = beats.length === 7;
  const correctOrder = AIDA_ORDER.every((name, i) => beatNames[i] === name);
  const totalDuration = beats.reduce((s, b) => s + (b.duration_s || 0), 0);
  const durationOk = totalDuration >= 45 && totalDuration <= 65;

  const imageIndexIssues: string[] = [];
  for (const b of beats) {
    if (b.image_index !== null && b.image_index !== undefined) {
      if (typeof b.image_index !== 'number' || b.image_index < 0 || b.image_index >= imageCount) {
        imageIndexIssues.push(`${b.beat}: image_index=${b.image_index} (imageCount=${imageCount})`);
      }
    }
  }

  const textsOk = beats.every((b) => typeof b.text === 'string' && b.text.trim().length > 0);

  return {
    jobId: script.jobId,
    pass: has7Beats && correctOrder && durationOk && imageIndexIssues.length === 0 && textsOk,
    checks: {
      has_7_beats:        { pass: has7Beats,               detail: `got ${beats.length}` },
      correct_aida_order: { pass: correctOrder,             detail: correctOrder ? 'OK' : `got: ${beatNames.join(',')}` },
      duration_45_65s:    { pass: durationOk,               detail: `${totalDuration}s` },
      image_index_bounds: { pass: imageIndexIssues.length === 0, detail: imageIndexIssues.join('; ') || 'all in bounds' },
      all_texts_present:  { pass: textsOk,                  detail: textsOk ? 'OK' : 'some beats missing text' },
    },
  };
}

function printResult(r: GateResult) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} Job: ${r.jobId}`);
  for (const [key, { pass, detail }] of Object.entries(r.checks)) {
    console.log(`   ${pass ? '✓' : '✗'} ${key}: ${detail}`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jobIdIdx = args.indexOf('--job-id');
  const jobIdArg = jobIdIdx !== -1 ? args[jobIdIdx + 1] : null;

  console.log('═══════════════════════════════════════════════════');
  console.log('  PROMO-02 GATE VALIDATOR — promo-scriptgen.ts');
  console.log('═══════════════════════════════════════════════════\n');

  if (jobIdArg) {
    // Validate existing script.json
    const scriptPath = join(PROMO_JOBS_DIR, jobIdArg, 'script.json');
    const productPath = join(PROMO_JOBS_DIR, jobIdArg, 'product.json');
    if (!existsSync(scriptPath)) {
      console.error(`❌ script.json not found: ${scriptPath}`);
      process.exit(1);
    }
    const script: PromoScript = JSON.parse(readFileSync(scriptPath, 'utf8'));
    const imageCount = existsSync(productPath)
      ? (JSON.parse(readFileSync(productPath, 'utf8')).images || []).length
      : 3;
    const result = validateScript(script, imageCount);
    printResult(result);
    process.exit(result.pass ? 0 : 1);
  }

  if (dryRun) {
    // Create 3 mock product jobs and validate scripts
    const testCases = [
      { jobId: 'validate-amazon-scriptgen', name: 'Amazon Product', images: 5, category: 'Electronics' },
      { jobId: 'validate-etsy-scriptgen',   name: 'Handmade Ceramic Mug', images: 4, category: 'Handmade' },
      { jobId: 'validate-shopify-scriptgen', name: 'Premium Hair Oil', images: 3, category: 'Beauty' },
    ];

    const results: GateResult[] = [];
    for (const tc of testCases) {
      const jobDir = join(PROMO_JOBS_DIR, tc.jobId);
      mkdirSync(jobDir, { recursive: true });
      // Write mock product.json
      const mockProduct = {
        name: tc.name, brand: 'TestBrand', price: '$29.99',
        description: 'A premium product with outstanding quality.',
        bulletPoints: ['Feature A', 'Feature B', 'Feature C'],
        images: Array.from({ length: tc.images }, (_, i) => `https://example.com/img${i}.jpg`),
        rating: '4.7', reviewCount: '2,341 reviews',
        topReviews: ['Amazing!', 'Worth every penny.'],
        category: tc.category, url: 'https://example.com/product',
      };
      writeFileSync(join(jobDir, 'product.json'), JSON.stringify(mockProduct, null, 2));

      console.log(`Generating (dry-run): ${tc.name}`);
      const r = await generateScript(tc.jobId, 'enthusiastic', true);
      if (!r.ok || !r.script) {
        results.push({ jobId: tc.jobId, pass: false, checks: { error: { pass: false, detail: r.error || 'no script' } } });
        continue;
      }
      results.push(validateScript(r.script, tc.images));
    }

    console.log('\n── Results ──────────────────────────────────────\n');
    let allPass = true;
    for (const r of results) {
      printResult(r);
      if (!r.pass) allPass = false;
    }

    console.log('═══════════════════════════════════════════════════');
    if (allPass) {
      console.log('✅ GATE PASS — All 3 scripts have valid 7-beat AIDA structure');
    } else {
      console.log('❌ GATE FAIL — One or more scripts failed validation');
    }
    console.log('═══════════════════════════════════════════════════');
    process.exit(allPass ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  --dry-run           Generate + validate 3 mock scripts');
  console.error('  --job-id <id>       Validate existing script.json');
  process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
