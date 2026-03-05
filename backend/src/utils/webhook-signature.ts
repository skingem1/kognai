import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

/**
 * Header name for webhook signature verification.
 * Clients should send the signature in this header.
 */
export const SIGNATURE_HEADER = 'x-invoica-signature' as const;

/**
 * Generates an HMAC-SHA256 signature for a webhook payload.
 * @param payload - The raw payload string (typically JSON.stringify'd)
 * @param secret - The webhook secret key
 * @returns The signature prefixed with 'sha256='
 */
export function generateSignature(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return 'sha256=' + hmac.digest('hex');
}

/**
 * Verifies a webhook signature using timing-safe comparison to prevent timing attacks.
 * @param payload - The original payload string
 * @param secret - The webhook secret key
 * @param signature - The signature to verify (should be prefixed with 'sha256=')
 * @returns True if signature is valid, false otherwise
 */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = generateSignature(payload, secret);

  // Early return for length mismatch to avoid unnecessary computation
  // and prevent potential timing leakage
  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Generates a cryptographically secure webhook secret.
 * @returns A new webhook secret prefixed with 'whsec_'
 */
export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(24).toString('hex');
}