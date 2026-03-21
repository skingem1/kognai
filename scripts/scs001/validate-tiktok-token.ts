/**
 * validate-tiktok-token.ts — Sprint 724
 *
 * Validates TIKTOK_ACCESS_TOKEN presence and metadata.
 * Checks: env var set, token-meta.json exists, token not expired,
 * client key/secret present.
 *
 * Usage:
 *   npx ts-node scripts/scs001/validate-tiktok-token.ts
 *
 * Exit codes: 0 = all checks pass, 1 = one or more checks fail
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

const ROOT = join(__dirname, '..', '..');
config({ path: join(ROOT, '.env') });

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  action?: string;
}

function runChecks(): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Client credentials
  const hasClientKey = !!process.env.TIKTOK_CLIENT_KEY;
  const hasClientSecret = !!process.env.TIKTOK_CLIENT_SECRET;
  results.push({
    name: 'Client Key',
    pass: hasClientKey,
    detail: hasClientKey ? 'TIKTOK_CLIENT_KEY is set' : 'TIKTOK_CLIENT_KEY missing from .env',
    action: hasClientKey ? undefined : 'Add TIKTOK_CLIENT_KEY to .env',
  });
  results.push({
    name: 'Client Secret',
    pass: hasClientSecret,
    detail: hasClientSecret ? 'TIKTOK_CLIENT_SECRET is set' : 'TIKTOK_CLIENT_SECRET missing from .env',
    action: hasClientSecret ? undefined : 'Add TIKTOK_CLIENT_SECRET to .env',
  });

  // 2. Access token
  const hasToken = !!process.env.TIKTOK_ACCESS_TOKEN;
  results.push({
    name: 'Access Token',
    pass: hasToken,
    detail: hasToken ? 'TIKTOK_ACCESS_TOKEN is set' : 'TIKTOK_ACCESS_TOKEN missing from .env',
    action: hasToken ? undefined : 'Run: npx ts-node scripts/tiktok-oauth.ts',
  });

  // 3. Token metadata file
  const metaPath = join(ROOT, 'data', 'tiktok-token-meta.json');
  const hasMeta = existsSync(metaPath);
  results.push({
    name: 'Token Metadata',
    pass: hasMeta,
    detail: hasMeta ? 'tiktok-token-meta.json exists' : 'Token metadata file not found',
    action: hasMeta ? undefined : 'OAuth flow creates this automatically',
  });

  // 4. Token expiry
  if (hasMeta) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      if (meta.expires_at) {
        const expiresAt = new Date(meta.expires_at);
        const hoursLeft = Math.round((expiresAt.getTime() - Date.now()) / 3600000);
        const notExpired = hoursLeft > 0;
        results.push({
          name: 'Token Expiry',
          pass: notExpired,
          detail: notExpired ? `Token expires in ${hoursLeft}h` : `Token expired ${Math.abs(hoursLeft)}h ago`,
          action: notExpired ? undefined : 'Run: npx ts-node scripts/tiktok-refresh-token.ts',
        });
      }
    } catch {
      results.push({
        name: 'Token Expiry',
        pass: false,
        detail: 'Could not parse token metadata',
      });
    }
  }

  // 5. Dry-run mode check
  const dryRun = process.env.AUTO_POST_DRY_RUN === '1';
  results.push({
    name: 'Live Mode',
    pass: !dryRun,
    detail: dryRun ? 'AUTO_POST_DRY_RUN=1 — posting is simulated' : 'Live posting enabled (no dry-run flag)',
    action: dryRun ? 'Remove AUTO_POST_DRY_RUN from .env to go live' : undefined,
  });

  return results;
}

function main() {
  console.log('=== TikTok Token Validation ===\n');
  const results = runChecks();
  let allPass = true;

  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.name}: ${r.detail}`);
    if (r.action) console.log(`   → Action: ${r.action}`);
    if (!r.pass) allPass = false;
  }

  console.log(`\n${allPass ? '✅ ALL CHECKS PASS — ready to post' : '❌ SOME CHECKS FAILED — see above'}`);
  process.exit(allPass ? 0 : 1);
}

main();
