import crypto from 'crypto';
import { generateSignature, verifySignature, generateWebhookSecret, SIGNATURE_HEADER } from '../webhook-signature';

describe('webhook-signature', () => {
  const payload = JSON.stringify({ event: 'invoice.created', id: 'inv_123' });
  const secret = 'whsec_testsecret1234567890123456789012';

  describe('generateSignature', () => {
    it('produces sha256= prefix followed by 64 hex chars', () => {
      const sig = generateSignature(payload, secret);
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('is deterministic for same payload and secret', () => {
      const sig1 = generateSignature(payload, secret);
      const sig2 = generateSignature(payload, secret);
      expect(sig1).toBe(sig2);
    });

    it('produces different signatures for different payload', () => {
      const sig1 = generateSignature(payload, secret);
      const sig2 = generateSignature('{"different":"payload"}', secret);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifySignature', () => {
    it('returns true for valid signature', () => {
      const sig = generateSignature(payload, secret);
      expect(verifySignature(payload, secret, sig)).toBe(true);
    });

    it('returns false for tampered payload', () => {
      const sig = generateSignature(payload, secret);
      expect(verifySignature('{"tampered":true}', secret, sig)).toBe(false);
    });

    it('returns false for wrong secret', () => {
      const sig = generateSignature(payload, secret);
      expect(verifySignature(payload, 'whsec_wrongsecret123456789012', sig)).toBe(false);
    });

    it('returns false for malformed signature', () => {
      expect(verifySignature(payload, secret, 'invalid')).toBe(false);
    });
  });

  describe('generateWebhookSecret', () => {
    it('matches format /^whsec_[a-f0-9]{48}$/', () => {
      const sec = generateWebhookSecret();
      expect(sec).toMatch(/^whsec_[a-f0-9]{48}$/);
    });

    it('generates unique secrets', () => {
      const s1 = generateWebhookSecret();
      const s2 = generateWebhookSecret();
      expect(s1).not.toBe(s2);
    });
  });

  it('exports SIGNATURE_HEADER constant', () => {
    expect(SIGNATURE_HEADER).toBe('x-invoica-signature');
  });
});