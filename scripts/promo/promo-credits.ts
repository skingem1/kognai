/**
 * promo-credits.ts — Sprint TICKET-008-PROMO-05
 *
 * Per-user credit system for /promo command.
 * - Free tier: 1 credit on first use
 * - Each video costs 1 credit
 * - When credits = 0: generate Stripe Payment Link
 *
 * Credits stored in: workspace/promo-credits/{userId}.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const CREDITS_DIR = join(ROOT, 'workspace', 'promo-credits');
const FREE_TIER_CREDITS = 1;
// Price per video pack (10 videos = $9.99)
const VIDEO_PACK_PRICE_CENTS = 999;
const VIDEO_PACK_VIDEOS = 10;

export interface UserCredits {
  userId: string;
  balance: number;
  totalUsed: number;
  createdAt: string;
  lastUsedAt?: string;
}

function creditsPath(userId: string): string {
  return join(CREDITS_DIR, `${userId}.json`);
}

export function getCredits(userId: string): UserCredits {
  mkdirSync(CREDITS_DIR, { recursive: true });
  const path = creditsPath(userId);
  if (!existsSync(path)) {
    // New user — init free tier
    const credits: UserCredits = {
      userId,
      balance: FREE_TIER_CREDITS,
      totalUsed: 0,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(path, JSON.stringify(credits, null, 2));
    return credits;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as UserCredits;
}

export function hasCredits(userId: string): boolean {
  return getCredits(userId).balance > 0;
}

export function deductCredit(userId: string): UserCredits {
  const credits = getCredits(userId);
  if (credits.balance <= 0) throw new Error('No credits remaining');
  credits.balance = Math.max(0, credits.balance - 1);
  credits.totalUsed += 1;
  credits.lastUsedAt = new Date().toISOString();
  writeFileSync(creditsPath(userId), JSON.stringify(credits, null, 2));
  return credits;
}

export function addCredits(userId: string, amount: number): UserCredits {
  const credits = getCredits(userId);
  credits.balance += amount;
  writeFileSync(creditsPath(userId), JSON.stringify(credits, null, 2));
  return credits;
}

/**
 * Generate a Stripe Payment Link for a video credit pack.
 * Creates a one-time Price + Payment Link via Stripe API.
 * Returns { url, error? }
 */
export function createStripePaymentLink(userId: string): { url: string | null; error?: string } {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { url: null, error: 'STRIPE_SECRET_KEY not set' };

  try {
    // Create a one-time price for video pack
    const priceResult = execSync(
      `curl -s -X POST "https://api.stripe.com/v1/prices" ` +
      `-u "${secretKey}:" ` +
      `-d "unit_amount=${VIDEO_PACK_PRICE_CENTS}" ` +
      `-d "currency=usd" ` +
      `-d "product_data[name]=Promo+Video+Pack+(${VIDEO_PACK_VIDEOS}+videos)" ` +
      `-d "product_data[description]=Generate+${VIDEO_PACK_VIDEOS}+AI+promotional+videos" `,
      { encoding: 'utf-8', timeout: 15_000 },
    );
    const price = JSON.parse(priceResult);
    if (!price.id) return { url: null, error: `Price creation failed: ${JSON.stringify(price).slice(0, 200)}` };

    // Create Payment Link
    const linkResult = execSync(
      `curl -s -X POST "https://api.stripe.com/v1/payment_links" ` +
      `-u "${secretKey}:" ` +
      `-d "line_items[0][price]=${price.id}" ` +
      `-d "line_items[0][quantity]=1" ` +
      `-d "metadata[userId]=${userId}" ` +
      `-d "metadata[product]=promo_video_pack" ` +
      `-d "after_completion[type]=redirect" ` +
      `-d "after_completion[redirect][url]=https://t.me/kognai_bot"`,
      { encoding: 'utf-8', timeout: 15_000 },
    );
    const link = JSON.parse(linkResult);
    if (!link.url) return { url: null, error: `Payment link creation failed: ${JSON.stringify(link).slice(0, 200)}` };
    return { url: link.url };
  } catch (e: any) {
    return { url: null, error: e.message?.slice(0, 200) };
  }
}

export function formatCreditMessage(credits: UserCredits): string {
  if (credits.balance === 0) return `You have 0 promo credits remaining.`;
  return `${credits.balance} promo credit${credits.balance === 1 ? '' : 's'} remaining.`;
}
