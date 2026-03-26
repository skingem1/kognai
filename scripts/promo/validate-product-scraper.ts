#!/usr/bin/env npx ts-node
/**
 * validate-product-scraper.ts — Sprint TICKET-008-PROMO-01
 *
 * Gate validator: loads a product.json (or runs scraper with --dry-run)
 * and checks it meets the TICKET-008-PROMO-01 acceptance criteria:
 *   - name present
 *   - price present
 *   - images[] >= 3
 *   - bulletPoints[] >= 2
 *
 * Usage:
 *   # Validate existing product.json:
 *   npx ts-node scripts/promo/validate-product-scraper.ts --job-id <id>
 *
 *   # Dry-run scrape + validate 3 test URLs:
 *   npx ts-node scripts/promo/validate-product-scraper.ts --dry-run
 *
 * Exit 0 = PASS, Exit 1 = FAIL
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { scrapeProduct, ProductData } from './product-scraper';

const ROOT = join(__dirname, '..', '..');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');

const TEST_URLS = [
  { url: 'https://www.amazon.com/dp/B08N5WRWNW', label: 'Amazon' },
  { url: 'https://www.etsy.com/listing/1234567890/handmade-ceramic-mug', label: 'Etsy' },
  { url: 'https://www.shopify.com', label: 'Shopify' },
];

interface ValidationResult {
  label: string;
  url: string;
  pass: boolean;
  checks: Record<string, boolean>;
  error?: string;
}

function validateProductData(data: ProductData, label: string, url: string): ValidationResult {
  const checks = {
    has_name: typeof data.name === 'string' && data.name.trim().length > 0,
    has_price: typeof data.price === 'string' && data.price.trim().length > 0,
    images_gte_3: Array.isArray(data.images) && data.images.length >= 3,
    bullet_points_gte_2: Array.isArray(data.bulletPoints) && data.bulletPoints.length >= 2,
  };
  const pass = Object.values(checks).every(Boolean);
  return { label, url, pass, checks };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jobIdArg = args.find((_, i) => args[i - 1] === '--job-id');

  console.log('═══════════════════════════════════════════════════');
  console.log('  PROMO-01 GATE VALIDATOR — product-scraper.ts');
  console.log('═══════════════════════════════════════════════════\n');

  if (jobIdArg) {
    // Validate existing product.json
    const productPath = join(PROMO_JOBS_DIR, jobIdArg, 'product.json');
    if (!existsSync(productPath)) {
      console.error(`❌ product.json not found: ${productPath}`);
      process.exit(1);
    }
    const data: ProductData = JSON.parse(readFileSync(productPath, 'utf8'));
    const result = validateProductData(data, jobIdArg, data.url || '');
    printResult(result);
    process.exit(result.pass ? 0 : 1);
  }

  if (dryRun) {
    // Dry-run scrape 3 test URLs and validate
    const results: ValidationResult[] = [];

    for (const { url, label } of TEST_URLS) {
      console.log(`Scraping (dry-run): ${label} — ${url}`);
      const jobId = `validate-${label.toLowerCase()}-${Date.now()}`;
      const scrapeResult = scrapeProduct(url, jobId, { dryRun: true });

      if (!scrapeResult.ok || !scrapeResult.data) {
        results.push({
          label,
          url,
          pass: false,
          checks: { has_name: false, has_price: false, images_gte_3: false, bullet_points_gte_2: false },
          error: scrapeResult.error,
        });
      } else {
        results.push(validateProductData(scrapeResult.data, label, url));
      }
    }

    console.log('\n── Results ──────────────────────────────────────\n');
    let allPass = true;
    for (const r of results) {
      printResult(r);
      if (!r.pass) allPass = false;
    }

    console.log('\n═══════════════════════════════════════════════════');
    if (allPass) {
      console.log('✅ GATE PASS — All 3 URLs returned valid ProductData');
    } else {
      console.log('❌ GATE FAIL — One or more URLs failed validation');
    }
    console.log('═══════════════════════════════════════════════════');
    process.exit(allPass ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  --dry-run           Run 3 test URLs in dry-run mode');
  console.error('  --job-id <id>       Validate existing workspace/promo-jobs/<id>/product.json');
  process.exit(1);
}

function printResult(r: ValidationResult) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.label} — ${r.url}`);
  if (r.error) {
    console.log(`   Error: ${r.error}`);
  } else {
    for (const [k, v] of Object.entries(r.checks)) {
      console.log(`   ${v ? '✓' : '✗'} ${k}`);
    }
  }
  console.log();
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
