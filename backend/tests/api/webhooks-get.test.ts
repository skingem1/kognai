import { Request, Response } from 'express';
import { getWebhook } from '../../src/api/webhooks-get';
import { registrations } from '../../src/services/webhook/types';

jest.mock('../../src/services/webhook/types');

describe('GET /v1/webhooks/:id', () => {
  let mockRes: Partial<Response>;
  let mockReq: Partial<Request>;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockReq = { params: {} };
    jest.clearAllMocks();
  });

  it('returns 400 for invalid id', async () => {
    mockReq.params = { id: '' };
    await getWebhook(mockReq as Request, mockRes as Response);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid id' });
  });

  it('returns 404 when registration not found', async () => {
    mockReq.params = { id: 'missing-id' };
    (registrations.get as jest.Mock).mockReturnValue(undefined);
    await getWebhook(mockReq as Request, mockRes as Response);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Webhook registration not found' });
  });

  it('returns 200 with registration when found', async () => {
    const webhook = { id: 'webhook-123', url: 'https://example.com', events: ['payment'] };
    mockReq.params = { id: 'webhook-123' };
    (registrations.get as jest.Mock).mockReturnValue(webhook);
    await getWebhook(mockReq as Request, mockRes as Response);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(webhook);
  });
});