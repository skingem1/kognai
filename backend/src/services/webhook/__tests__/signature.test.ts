import { signPayload, verifySignature } from '../signature';

describe('webhook/signature', () => {
  const secret = 'test-secret-key';

  it('signPayload returns hex string of length 64', () => {
    const signature = signPayload('{"event":"payment"}', secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(signature).toHaveLength(64);
  });

  it('signPayload is deterministic', () => {
    const payload = '{"event":"payment"}';
    expect(signPayload(payload, secret)).toBe(signPayload(payload, secret));
  });

  it('signPayload different payloads produce different signatures', () => {
    const sig1 = signPayload('payload-a', secret);
    const sig2 = signPayload('payload-b', secret);
    expect(sig1).not.toBe(sig2);
  });

  it('verifySignature returns true for valid signature', () => {
    const payload = '{"event":"payment"}';
    const signature = signPayload(payload, secret);
    expect(verifySignature(payload, signature, secret)).toBe(true);
  });

  it('verifySignature returns false for tampered payload', () => {
    const payload = '{"event":"payment"}';
    const signature = signPayload(payload, secret);
    expect(verifySignature('{"event":"tampered"}', signature, secret)).toBe(false);
  });
});