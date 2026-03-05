import { createHmac } from 'crypto';
import { verifyWebhookSignature, parseWebhookEvent } from '../webhook';

describe('verifyWebhookSignature', () => {
  const payload = '{"event":"test"}';
  const secret = 'test-secret';

  it('returns true for correct signature', () => {
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(verifyWebhookSignature(payload, expected, secret)).toBe(true);
  });

  it('returns false for wrong signature', () => {
    expect(verifyWebhookSignature(payload, 'invalid-signature', secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    expect(verifyWebhookSignature(payload, expected, 'wrong-secret')).toBe(false);
  });
});

describe('parseWebhookEvent', () => {
  it('returns correct fields from valid JSON', () => {
    const input = JSON.stringify({ id: '123', type: 'payment', data: { amount: 100 }, createdAt: '2024-01-01' });
    const result = parseWebhookEvent(input);
    expect(result).toEqual({ id: '123', type: 'payment', data: { amount: 100 }, createdAt: '2024-01-01' });
  });

  it('filters extra fields and returns only id,type,data,createdAt', () => {
    const input = JSON.stringify({ id: '123', type: 'payment', data: {}, createdAt: '2024', extra: 'ignored' });
    const result = parseWebhookEvent(input);
    expect(result).toEqual({ id: '123', type: 'payment', data: {}, createdAt: '2024' });
    expect(Object.keys(result)).toHaveLength(4);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseWebhookEvent('not-json')).toThrow();
  });
});