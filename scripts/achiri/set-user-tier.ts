/**
 * Achiri Tier Management CLI — Sprint 1443
 *
 * Usage:
 *   npx ts-node scripts/achiri/set-user-tier.ts <userId> <tier> [--reason <text>]
 *   npx ts-node scripts/achiri/set-user-tier.ts --list
 *
 * Tiers: free | tnd_basic | tnd_premium
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const TIERS_PATH = join(ROOT, 'workspace', 'achiri', 'user-tiers.json');
const LOG_PATH  = join(ROOT, 'workspace', 'achiri', 'tier-changes.jsonl');
const VALID_TIERS = ['free', 'tnd_basic', 'tnd_premium'] as const;
type Tier = typeof VALID_TIERS[number];

function loadTiers(): Record<string, Tier> {
  if (!existsSync(TIERS_PATH)) return {};
  try { return JSON.parse(readFileSync(TIERS_PATH, 'utf8')); } catch { return {}; }
}

function saveTiers(tiers: Record<string, Tier>): void {
  writeFileSync(TIERS_PATH, JSON.stringify(tiers, null, 2));
}

function listNonFree(tiers: Record<string, Tier>): void {
  const elevated = Object.entries(tiers).filter(([, t]) => t !== 'free');
  if (elevated.length === 0) {
    console.log('No users with elevated tiers.');
    return;
  }
  console.log(`\nElevated tier users (${elevated.length}):\n`);
  for (const [userId, tier] of elevated) {
    console.log(`  ${userId.padEnd(30)} ${tier}`);
  }
  console.log();
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.length === 0) {
    listNonFree(loadTiers());
    process.exit(0);
  }

  if (args.length < 2) {
    console.error('Usage: set-user-tier.ts <userId> <tier> [--reason <text>]');
    console.error('       set-user-tier.ts --list');
    process.exit(1);
  }

  const [userId, tierArg] = args;
  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args.slice(reasonIdx + 1).join(' ') : 'manual operator action';

  if (!VALID_TIERS.includes(tierArg as Tier)) {
    console.error(`Invalid tier "${tierArg}". Must be: ${VALID_TIERS.join(' | ')}`);
    process.exit(1);
  }
  const newTier = tierArg as Tier;

  const tiers = loadTiers();
  const oldTier: Tier = (tiers[userId] as Tier) ?? 'free';

  if (oldTier === newTier) {
    console.log(`No change: ${userId} is already ${newTier}`);
    process.exit(0);
  }

  tiers[userId] = newTier;
  saveTiers(tiers);

  const entry = { ts: new Date().toISOString(), userId, old_tier: oldTier, new_tier: newTier, reason };
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');

  console.log(`✅ ${userId}: ${oldTier} → ${newTier} (${reason})`);
}

main();
