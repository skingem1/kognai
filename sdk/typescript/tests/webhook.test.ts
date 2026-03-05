import { verifyWebhookSignature, parseWebhookEvent } from '../src/webhook';
import { createHmac } from 'crypto';

describe('verifyWebhookSignature', () => {
  const payload = '{"id":"evt_1","type":"invoice.created"}';
  const secret = 'webhook-secret-key';
  const validSig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  it('returns true for valid signature', () => {
    expect(verifyWebhookSignature(payload, validSig, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifyWebhookSignature(payload, 'invalid-sig', secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const wrongSig = createHmac('sha256', 'wrong-secret').update(payload, 'utf8').digest('hex');
    expect(verifyWebhookSignature(payload, wrongSig, secret)).toBe(false);
  });

  it('handles empty payload with valid signature', () => {
    const emptyPayload = '';
    const emptySig = createHmac('sha256', secret).update(emptyPayload, 'utf8').digest('hex');
    expect(verifyWebhookSignature(emptyPayload, emptySig, secret)).toBe(true);
  });
});

describe('parseWebhookEvent', () => {
  const validPayload = '{"id":"evt_1","type":"invoice.created","data":{"amount":100},"createdAt":"2026-01-01T00:00:00Z","extra":"ignored"}';

  it('parses valid JSON and extracts required fields', () => {
    const result = parseWebhookEvent(validPayload);
    expect(result).toEqual({
      id: 'evt_1',
      type: 'invoice.created',
      data: { amount: 100 },
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseWebhookEvent('not json')).toThrow(SyntaxError);
  });
});