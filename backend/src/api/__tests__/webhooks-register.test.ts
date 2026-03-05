import { Request, Response } from 'express';
import { registerWebhookHandler } from '../webhooks-register';
import { WebhookRepository } from '../../repositories/webhook.repository';

jest.mock('../../repositories/webhook.repository');

describe('POST /webhooks registerWebhookHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockRegister: jest.Mock;

  beforeEach(() => {
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();
    mockRegister = jest.fn().mockResolvedValue({
      id: 'webhook-123',
      url: 'https://example.com/hook',
      events: ['invoice.created'],
      secret: 'test-secret-1234567890',
      createdAt: new Date(),
    });
    (WebhookRepository as jest.Mock).mockImplementation(() => ({
      register: mockRegister,
    }));
  });

  it('returns 201 for valid registration', async () => {
    mockReq = { body: { url: 'https://example.com/hook', events: ['invoice.created'], secret: 'test-secret-1234567890' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockStatus).toHaveBeenCalledWith(201);
  });

  it('returns JSON with created webhook data', async () => {
    mockReq = { body: { url: 'https://example.com/hook', events: ['invoice.created'], secret: 'test-secret-1234567890' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ id: 'webhook-123', url: 'https://example.com/hook' }));
  });

  it('returns 400 for invalid URL', async () => {
    mockReq = { body: { url: 'not-a-url', events: ['invoice.created'], secret: 'test-secret-1234567890' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 400 for missing events array', async () => {
    mockReq = { body: { url: 'https://example.com/hook', secret: 'test-secret-1234567890' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 for secret shorter than 16 chars', async () => {
    mockReq = { body: { url: 'https://example.com/hook', events: ['invoice.created'], secret: 'short' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('calls repository register with correct params', async () => {
    mockReq = { body: { url: 'https://example.com/hook', events: ['invoice.created'], secret: 'test-secret-1234567890' } };
    mockRes = { status: mockStatus, json: mockJson };
    await registerWebhookHandler(mockReq as Request, mockRes as Response);
    expect(mockRegister).toHaveBeenCalledWith('https://example.com/hook', ['invoice.created'], 'test-secret-1234567890');
  });
});