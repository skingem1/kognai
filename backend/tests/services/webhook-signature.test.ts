import { signPayload, verifySignature } from '../../src/services/webhook/signature';

describe('webhook signature', () => {
  const secret = 'test-secret';
  const payload = '{"event":"payment.created","id":"evt_123"}';

  it('signPayload returns valid HMAC-SHA256 hex digest', () => {
    const signature = signPayload(payload, secret);
    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[a-f0-9]+$/);
  });

  it('verifySignature returns true for valid signature', () => {
    const signature = signPayload(payload, secret);
    expect(verifySignature(payload, signature, secret)).toBe(true);
  });

  it('verifySignature returns false for invalid signature', () => {
    const invalidSig = 'a'.repeat(64);
    expect(verifySignature(payload, invalidSig, secret)).toBe(false);
  });

  it('verifySignature returns false for tampered payload', () => {
    const signature = signPayload(payload, secret);
    const tamperedPayload = '{"event":"payment.deleted","id":"evt_999"}';
    expect(verifySignature(tamperedPayload, signature, secret)).toBe(false);
  });

  it('verifySignature returns false for mismatched lengths', () => {
    const signature = signPayload(payload, secret);
    expect(verifySignature(payload, signature.slice(0, 32), secret)).toBe(false);
  });
});