/**
 * lemon-webhook.ts — LemonSqueezy webhook handler
 * Sprint 1238 / LEMON-SCAFFOLD-01
 *
 * Handles events: subscription_created, subscription_renewed,
 * subscription_cancelled, subscription_payment_success.
 * Validates X-Signature-256 HMAC header using LEMONSQUEEZY_SIGNING_SECRET.
 * On subscription_created: upserts row in Supabase subscribers table.
 *
 * Mount as: app.post('/webhooks/lemon', express.raw({ type: 'application/json' }), lemonWebhookHandler);
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { LEMON_SIGNING_SECRET } from './lemon-config';

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

function getSupabase() {
  const url    = process.env['SUPABASE_URL']         ?? '';
  const key    = process.env['SUPABASE_SERVICE_KEY'] ?? process.env['SUPABASE_KEY'] ?? '';
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody: Buffer, signature: string): boolean {
  if (!LEMON_SIGNING_SECRET || !signature) return false;
  const expected = createHmac('sha256', LEMON_SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

interface LemonSubscription {
  id:         string;
  attributes: {
    status:           string;
    user_email:       string;
    variant_id:       number;
    created_at:       string;
    cancelled_at:     string | null;
    renews_at:        string | null;
    ends_at:          string | null;
  };
}

async function handleSubscriptionCreated(data: LemonSubscription): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('subscribers').upsert({
    lemon_subscription_id: data.id,
    user_email:            data.attributes.user_email,
    plan:                  String(data.attributes.variant_id),
    status:                data.attributes.status,
    activated_at:          data.attributes.created_at,
    cancelled_at:          data.attributes.cancelled_at ?? null,
  }, { onConflict: 'lemon_subscription_id' });

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  console.log(`[lemon-webhook] subscriber created: ${data.attributes.user_email}`);
}

async function handleSubscriptionCancelled(data: LemonSubscription): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('subscribers')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('lemon_subscription_id', data.id);

  if (error) throw new Error(`Supabase update failed: ${error.message}`);
  console.log(`[lemon-webhook] subscriber cancelled: ${data.id}`);
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function lemonWebhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-signature-256'] as string | undefined ?? '';
  const rawBody   = req.body as Buffer;

  if (!verifySignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let payload: { meta: { event_name: string }; data: LemonSubscription };
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const event = payload.meta?.event_name ?? '';

  try {
    switch (event) {
      case 'subscription_created':
      case 'subscription_payment_success':
        await handleSubscriptionCreated(payload.data);
        break;

      case 'subscription_renewed':
        // Update status to active on renewal
        await handleSubscriptionCreated(payload.data);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(payload.data);
        break;

      default:
        console.log(`[lemon-webhook] unhandled event: ${event}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lemon-webhook] handler error: ${msg}`);
    res.status(500).json({ error: msg });
  }
}
