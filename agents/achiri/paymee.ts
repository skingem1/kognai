// Achiri — Paymee T3 Skill (Sprint 126)
// Generates TND payment checkout URLs for Achiri tier upgrades.
// Real mode: PAYMEE_API_KEY set → POST to paymee.tn API v2.
// Mock mode: PAYMEE_API_KEY not set or PAYMEE_MOCK=1 → returns mock URL.
// Tiers: tnd_basic=9 TND/mo, tnd_premium=25 TND/mo.

import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';

export interface PaymeeParams {
  userId: string;
  tier: 'tnd_basic' | 'tnd_premium';
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymeeResult {
  checkout_url: string;
  order_id: string;
  amount_tnd: number;
  tier: string;
  mock: boolean;
}

// Amount per tier in TND (matches kognai-agents/achiri/config.json)
const TIER_AMOUNTS: Record<'tnd_basic' | 'tnd_premium', number> = {
  tnd_basic: 9,
  tnd_premium: 25,
};

const TIER_LABELS: Record<'tnd_basic' | 'tnd_premium', string> = {
  tnd_basic: 'Achiri Basic',
  tnd_premium: 'Achiri Premium',
};

const PAYMEE_API_URL = 'https://app.paymee.tn/api/v2/payments/create';

function generateOrderId(userId: string, tier: string): string {
  const rand = crypto.randomBytes(6).toString('hex');
  const ts = Date.now().toString(36);
  return `ACH-${tier.replace('tnd_', '').toUpperCase()}-${ts}-${rand}`;
}

function httpPost(url: string, payload: unknown, headers: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    };
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function createCheckoutUrl(params: PaymeeParams): Promise<PaymeeResult> {
  const { userId, tier, firstName, lastName, email, phone, returnUrl, cancelUrl } = params;
  const amount = TIER_AMOUNTS[tier];
  const orderId = generateOrderId(userId, tier);
  const isMock = !process.env.PAYMEE_API_KEY || process.env.PAYMEE_MOCK === '1';

  if (isMock) {
    return {
      checkout_url: `https://app.paymee.tn/mock/checkout/${orderId}?amount=${amount}&tier=${tier}`,
      order_id: orderId,
      amount_tnd: amount,
      tier,
      mock: true,
    };
  }

  // Real Paymee API call
  const vendorId = parseInt(process.env.PAYMEE_VENDOR_ID ?? '0', 10);
  const payload = {
    vendor: vendorId,
    amount,
    note: `${TIER_LABELS[tier]} — 1 month subscription`,
    first_name: firstName ?? 'Achiri',
    last_name: lastName ?? 'User',
    email: email ?? '',
    phone: phone ?? '',
    return_url: returnUrl ?? 'https://kognai.ai/achiri/upgrade/success',
    cancel_url: cancelUrl ?? 'https://kognai.ai/achiri/upgrade/cancel',
    webhook_url: process.env.PAYMEE_WEBHOOK_URL ?? '',
    order_id: orderId,
  };

  const headers = { 'Authorization': `Token ${process.env.PAYMEE_API_KEY}` };

  let data: any;
  try {
    data = await httpPost(PAYMEE_API_URL, payload, headers);
  } catch (err) {
    throw new Error(`Paymee API error: ${(err as Error).message}`);
  }

  if (!data?.data?.payment_url) {
    throw new Error(`Paymee returned unexpected response: ${JSON.stringify(data)}`);
  }

  return {
    checkout_url: data.data.payment_url as string,
    order_id: orderId,
    amount_tnd: amount,
    tier,
    mock: false,
  };
}

// Returns a localized upgrade prompt message with the payment link.
// lang: 'ar' (Darija/Arabic), 'fr' (French), 'en' (English)
export function getUpgradeMessage(
  tier: 'tnd_basic' | 'tnd_premium',
  checkoutUrl: string,
  lang: 'ar' | 'fr' | 'en' = 'ar',
): string {
  const amount = TIER_AMOUNTS[tier];
  const label = TIER_LABELS[tier];

  if (lang === 'ar') {
    if (tier === 'tnd_basic') {
      return `وصلت للحد اليومي (50 رسالة). للاشتراك في الخطة الأساسية (${amount} دينار/شهر) وتحصل على رسائل غير محدودة، اضغط هنا: ${checkoutUrl}`;
    }
    return `اشترك في ${label} (${amount} دينار/شهر) وتحصل على كل المميزات + رسائل صوتية: ${checkoutUrl}`;
  }

  if (lang === 'fr') {
    if (tier === 'tnd_basic') {
      return `Vous avez atteint la limite journalière (50 messages). Abonnez-vous au plan Basic (${amount} TND/mois) pour des messages illimités: ${checkoutUrl}`;
    }
    return `Abonnez-vous à ${label} (${amount} TND/mois) pour toutes les fonctionnalités: ${checkoutUrl}`;
  }

  // English fallback
  if (tier === 'tnd_basic') {
    return `You've reached the daily limit (50 messages). Subscribe to Basic (${amount} TND/month) for unlimited messages: ${checkoutUrl}`;
  }
  return `Subscribe to ${label} (${amount} TND/month) for all features: ${checkoutUrl}`;
}
