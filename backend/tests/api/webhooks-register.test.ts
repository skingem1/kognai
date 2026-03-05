import { Request, Response } from 'express';
import { registerWebhook } from '../../src/api/webhooks-register';
import { register } from '../../src/services/webhook/types';

jest.mock('../../src/services/webhook/types');

const mockRegister = register as jest.MockedFunction<typeof register>;
const mockRes = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('registerWebhook', () => {
  it('returns 201 with registration on valid input', async () => {
    const mockReg = { id: '1', url: 'https://example.com', events: ['payment'], secret: 'secret1234567890' };
    mockRegister.mockResolvedValue(mockReg);
    const req = { body: { url: 'https://example.com', events: ['payment'], secret: 'secret1234567890' } } as Request;
    const res = mockRes();
    await registerWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockReg);
  });

  it('returns 400 on invalid url', async () => {
    const req = { body: { url: 'not-a-url', events: ['payment'], secret: 'secret1234567890' } } as Request;
    const res = mockRes();
    await registerWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 on empty events array', async () => {
    const req = { body: { url: 'https://example.com', events: [], secret: 'secret1234567890' } } as Request;
    const res = mockRes();
    await registerWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 on short secret', async () => {
    const req = { body: { url: 'https://example.com', events: ['payment'], secret: 'short' } } as Request;
    const res = mockRes();
    await registerWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});