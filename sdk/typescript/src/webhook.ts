import { createHmac, timingSafeEqual } from 'crypto';

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
}

export function parseWebhookEvent(payload: string): { id: string; type: string; data: unknown; createdAt: string } {
  const parsed = JSON.parse(payload);
  return { id: parsed.id, type: parsed.type, data: parsed.data, createdAt: parsed.createdAt };
}