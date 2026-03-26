#!/usr/bin/env npx ts-node
/**
 * product-scraper.ts — Sprint TICKET-008-PROMO-01
 *
 * TypeScript CLI wrapper around product-scraper.py.
 * Calls browser_use Agent via Python venv, saves ProductData JSON to
 * workspace/promo-jobs/{jobId}/product.json.
 *
 * Usage:
 *   npx ts-node scripts/promo/product-scraper.ts --url <URL> --job-id <id>
 *   npx ts-node scripts/promo/product-scraper.ts --url <URL> --job-id <id> --headless
 *   npx ts-node scripts/promo/product-scraper.ts --url <URL> --job-id <id> --dry-run
 *
 * Output: workspace/promo-jobs/{jobId}/product.json
 * Stdout: { ok: true, jobId, outputPath } | { ok: false, error }
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = join(__dirname, '..', '..');
const VENV_PYTHON = join(ROOT, '.venv-browser-use', 'bin', 'python');
const PY_SCRIPT = join(ROOT, 'scripts', 'promo', 'product-scraper.py');
const PROMO_JOBS_DIR = join(ROOT, 'workspace', 'promo-jobs');

export interface ProductData {
  name: string;
  brand: string;
  price: string;
  description: string;
  bulletPoints: string[];
  images: string[];
  rating: string;
  reviewCount: string;
  topReviews: string[];
  category: string;
  url: string;
}

export interface ScrapeResult {
  ok: boolean;
  jobId?: string;
  outputPath?: string;
  data?: ProductData;
  error?: string;
}

function scrapeProduct(url: string, jobId: string, opts: { headless?: boolean; dryRun?: boolean } = {}): ScrapeResult {
  if (!existsSync(VENV_PYTHON)) {
    return { ok: false, error: `Python venv not found: ${VENV_PYTHON}. Run install-browser-use.sh first.` };
  }
  if (!existsSync(PY_SCRIPT)) {
    return { ok: false, error: `Scraper script not found: ${PY_SCRIPT}` };
  }

  const args: string[] = [`--url`, url];
  if (opts.headless) args.push('--headless');
  if (opts.dryRun) args.push('--dry-run');

  const cmd = `${VENV_PYTHON} ${PY_SCRIPT} ${args.map(a => `"${a}"`).join(' ')}`;

  let stdout: string;
  try {
    stdout = execSync(cmd, { timeout: 120_000, encoding: 'utf8', cwd: ROOT }).trim();
  } catch (err: any) {
    const msg = err.stderr ? err.stderr.toString().slice(0, 500) : err.message;
    return { ok: false, error: `Python script failed: ${msg}` };
  }

  // Find JSON in stdout (Python may emit warnings before JSON)
  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd === 0) {
    return { ok: false, error: `No JSON in output: ${stdout.slice(0, 200)}` };
  }

  let parsed: { ok: boolean; data?: ProductData; error?: string };
  try {
    parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd));
  } catch (e: any) {
    return { ok: false, error: `JSON parse failed: ${e.message}` };
  }

  if (!parsed.ok || !parsed.data) {
    return { ok: false, error: parsed.error || 'Scraper returned ok:false' };
  }

  // Save to workspace/promo-jobs/{jobId}/product.json
  const jobDir = join(PROMO_JOBS_DIR, jobId);
  mkdirSync(jobDir, { recursive: true });
  const outputPath = join(jobDir, 'product.json');
  writeFileSync(outputPath, JSON.stringify(parsed.data, null, 2));

  return { ok: true, jobId, outputPath, data: parsed.data };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);

  let url = '';
  let jobId = '';
  let headless = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url') url = args[++i] || '';
    else if (args[i] === '--job-id') jobId = args[++i] || '';
    else if (args[i] === '--headless') headless = true;
    else if (args[i] === '--dry-run') dryRun = true;
  }

  if (!url || !jobId) {
    console.error('Usage: product-scraper.ts --url <URL> --job-id <id> [--headless] [--dry-run]');
    process.exit(1);
  }

  console.error(`Scraping: ${url} → job ${jobId}`);
  const result = scrapeProduct(url, jobId, { headless, dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

export { scrapeProduct };
