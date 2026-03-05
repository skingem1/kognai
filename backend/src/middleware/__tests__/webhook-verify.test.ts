import { signPayload, verifyWebhookSignature } from '../webhook-verify';

describe('webhook-verify', () => {
  it('signPayload returns 64-char hex string', () => {
    const result = signPayload('test', 'secret');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('middleware returns 401 when no signature header', () => {
    const middleware = verifyWebhookSignature('secret');
    const req = { headers: {} } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('middleware returns 401 when no body', () => {
    const middleware = verifyWebhookSignature('secret');
    const req = { headers: { 'x-countable-signature': 'sig' }, body: undefined } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('middleware calls next() for valid signature', () => {
    const secret = 'test-secret';
    const body = '{"test":true}';
    const sig = signPayload(body, secret);
    const middleware = verifyWebhookSignature(secret);
    const req = { headers: { 'x-countable-signature': sig }, body } as any;
    const res = {} as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('middleware returns 401 for invalid signature', () => {
    const middleware = verifyWebhookSignature('secret');
    const req = { headers: { 'x-countable-signature': 'invalid' }, body: 'test' } as any;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('middleware handles JSON object body', () => {
    const secret = 'test-secret';
    const body = { test: true };
    const bodyStr = JSON.stringify(body);
    const sig = signPayload(bodyStr, secret);
    const middleware = verifyWebhookSignature(secret);
    const req = { headers: { 'x-countable-signature': sig }, body } as any;
    const res = {} as any;
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});