import { describe, it, expect, vi } from 'vitest';
import { signPayload, verifyWebhookSignature } from '../../src/middleware/webhook-verify';
import type { Request, Response, NextFunction } from 'express';

describe('webhook-verify', () => {
  describe('signPayload', () => {
    it('creates consistent HMAC-SHA256 signature', () => {
      const sig1 = signPayload('test payload', 'secret');
      const sig2 = signPayload('test payload', 'secret');
      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(64);
    });

    it('produces different signatures for different secrets', () => {
      const sig1 = signPayload('payload', 'secret1');
      const sig2 = signPayload('payload', 'secret2');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyWebhookSignature', () => {
    const secret = 'test-secret';
    const createReq = (body: string | Buffer, signature: string) => ({
      headers: { 'x-countable-signature': signature },
      body,
    } as unknown as Request);

    it('calls next() for valid signature', () => {
      const payload = 'valid body';
      const signature = signPayload(payload, secret);
      const req = createReq(payload, signature);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      verifyWebhookSignature(secret)(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 401 for invalid signature', () => {
      const req = createReq('body', 'invalid-signature'.padEnd(64, '0'));
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      verifyWebhookSignature(secret)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 for missing signature header', () => {
      const req = { headers: {}, body: 'body' } as unknown as Request;
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      verifyWebhookSignature(secret)(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('handles Buffer body from express.raw()', () => {
      const payload = 'buffer body';
      const signature = signPayload(payload, secret);
      const req = createReq(Buffer.from(payload), signature);
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
      const next = vi.fn() as NextFunction;

      verifyWebhookSignature(secret)(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});