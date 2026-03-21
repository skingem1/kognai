// Achiri Tier Store — Sprint 622
// Persists user tier upgrades to workspace/achiri/user-tiers.json.
// Format: { "userId": { "tier": "tnd_basic", "upgraded_at": "ISO", "order_id": "ACH-..." } }

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const TIERS_FILE = join('workspace', 'achiri', 'user-tiers.json');

export type AchiriTier = 'free' | 'tnd_basic' | 'tnd_premium';

export interface TierEntry {
  tier: AchiriTier;
  upgraded_at: string;
  order_id: string;
}

type TierStore = Record<string, TierEntry>;

function ensureDir(): void {
  const dir = dirname(TIERS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadTiers(): TierStore {
  if (!existsSync(TIERS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(TIERS_FILE, 'utf8')) as TierStore;
  } catch {
    return {};
  }
}

export function getUserTier(userId: string): AchiriTier {
  const tiers = loadTiers();
  return tiers[userId]?.tier ?? 'free';
}

export function setUserTier(userId: string, tier: AchiriTier, orderId: string): void {
  ensureDir();
  const tiers = loadTiers();
  tiers[userId] = {
    tier,
    upgraded_at: new Date().toISOString(),
    order_id: orderId,
  };
  writeFileSync(TIERS_FILE, JSON.stringify(tiers, null, 2), 'utf8');
  console.log(`[Achiri-Tier] ${userId} upgraded to ${tier} (order: ${orderId})`);
}
