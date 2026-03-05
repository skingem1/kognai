import crypto from 'crypto';
import { constructEvent, WebhookVerificationError } from '../webhook-verify';

describe('WebhookVerificationError', () => {
  it('sets name and message correctly', () => {
    const error = new WebhookVerificationError('test message');
    expect(error.name).toBe('WebhookVerificationError');
    expect(error.message).toBe('test message');
  });

  it('is instanceof Error', () => {
    expect(new WebhookVerificationError('test')).toBeInstanceOf(Error);
  });
});

describe('constructEvent', () => {
  const secret = 'test-secret';
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment.completed', data: {}, timestamp: 1234567890, signature: 'sig_1' });
  const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  it('returns parsed event object with valid signature', () => {
    const event = constructEvent(payload, validSig, secret);
    expect(event).toEqual({ id: 'evt_1', type: 'payment.completed', data: {}, timestamp: 1234567890, signature: 'sig_1' });
  });

  it('throws on invalid signature', () => {
    expect(() => constructEvent(payload, 'bad-sig', secret)).toThrow(WebhookVerificationError);
  });

  it('throws on wrong secret', () => {
    expect(() => constructEvent(payload, validSig, 'wrong-secret')).toThrow(WebhookVerificationError);
  });

  it('throws on tampered payload', () => {
    const tampered = JSON.stringify({ id: 'evt_1', type: 'payment.completed', data: { hacked: true }, timestamp: 1234567890, signature: 'sig_1' });
    expect(() => constructEvent(tampered, validSig, secret)).toThrow(WebhookVerificationError);
  });
});