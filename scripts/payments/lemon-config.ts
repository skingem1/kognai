/**
 * lemon-config.ts — LemonSqueezy environment configuration
 * Sprint 1238 / LEMON-SCAFFOLD-01
 */

export const LEMON_API_KEY      = process.env['LEMONSQUEEZY_API_KEY']      ?? '';
export const LEMON_STORE_ID     = process.env['LEMONSQUEEZY_STORE_ID']     ?? '';
export const LEMON_SIGNING_SECRET = process.env['LEMONSQUEEZY_SIGNING_SECRET'] ?? '';

// Variant IDs for each subscription tier (comma-separated in env)
export const LEMON_VARIANT_IDS: string[] = (process.env['LEMONSQUEEZY_VARIANT_IDS'] ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const LEMON_CHECKOUT_BASE = 'https://kognai.lemonsqueezy.com/checkout/buy';
