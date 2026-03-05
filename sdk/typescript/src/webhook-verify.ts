import { createHmac, timingSafeEqual } from 'crypto';

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface WebhookEvent {
  id: string;
  type: 'invoice.created' | 'invoice.paid' | 'settlement.completed' | 'settlement.failed' | 'apikey.revoked';
  data: Record<string, unknown>;
  timestamp: string;
  signature: string;
}

/**
 * Constructs and verifies a webhook event from payload, signature, and secret.
 * Uses HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 * @param payload - The raw JSON string payload from the webhook
 * @param signature - The HMAC-SHA256 signature from the webhook header (hex string)
 * @param secret - The webhook secret used to verify the signature
 * @returns The verified WebhookEvent object
 * @throws WebhookVerificationError if signature is invalid or payload is malformed
 */
export function constructEvent(payload: string, signature: string, secret: string): WebhookEvent {
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new WebhookVerificationError('Invalid webhook signature');
  }

  return JSON.parse(payload) as WebhookEvent;
}
