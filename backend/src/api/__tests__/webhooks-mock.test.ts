import { Request, Response } from 'express';
import { listWebhooks, registerWebhook } from '../webhooks-mock';

describe('webhooks-mock', () => {
  describe('listWebhooks', () => {
    it('returns webhooks list with total count and correct data', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await listWebhooks({} as Request, mockRes as unknown as Response);
      
      expect(mockRes.json).toHaveBeenCalledTimes(1);
      const { webhooks, total } = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(total).toBe(1);
      expect(webhooks[0].id).toBe('wh_001');
      expect(webhooks[0].status).toBe('active');
      expect(webhooks[0].events).toContain('invoice.paid');
      expect(webhooks[0].events).toContain('settlement.confirmed');
    });
  });

  describe('registerWebhook', () => {
    it('creates webhook with custom URL', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await registerWebhook({ body: { url: 'https://my.site/hook' } } as Request, mockRes as unknown as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      const webhook = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(webhook.url).toBe('https://my.site/hook');
      expect(webhook.id).toBe('wh_002');
      expect(webhook.status).toBe('active');
      expect(webhook.secret).toBe('whsec_abc123');
    });

    it('creates webhook with custom events', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await registerWebhook({ body: { events: ['invoice.paid'] } } as Request, mockRes as unknown as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      const webhook = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(webhook.events).toEqual(['invoice.paid']);
    });

    it('creates webhook with default values when body is empty', async () => {
      const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await registerWebhook({ body: {} } as Request, mockRes as unknown as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      const webhook = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(webhook.url).toBe('https://example.com/new');
      expect(webhook.events).toEqual(['invoice.created']);
      expect(webhook.id).toBe('wh_002');
      expect(webhook.status).toBe('active');
      expect(webhook.secret).toBe('whsec_abc123');
    });
  });
});