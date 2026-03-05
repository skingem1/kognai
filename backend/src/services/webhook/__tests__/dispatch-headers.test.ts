import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { WebhookEvent, WebhookRegistration } from '../../types/webhook';

// Mock signature module - must use relative path from __tests__
jest.mock('../signature', () => ({
  signPayload: jest.fn().mockReturnValue('mock-sig'),
}));

// Mock globalThis.fetch
const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch;

describe('dispatch headers validation', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  it('includes correct headers in POST request', async () => {
    const { dispatchWebhook } = await import('../dispatch');
    const event: WebhookEvent = { type: 'invoice.created', payload: { id: '1' }, timestamp: 1700000000 };
    const registration: WebhookRegistration = { url: 'https://example.com/webhook', secret: 'secret' };

    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

    await dispatchWebhook(event, registration);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Invoica-Signature': 'mock-sig',
          'X-Invoica-Event': 'invoice.created',
          'X-Invoica-Timestamp': '1700000000',
        },
      })
    );
  });

  it('calls signPayload with JSON.stringify(event)', async () => {
    const { signPayload } = await import('../signature');
    const { dispatchWebhook } = await import('../dispatch');
    const event: WebhookEvent = { type: 'payment.received', payload: {}, timestamp: 1700000001 };
    const registration: WebhookRegistration = { url: 'https://example.com/webhook', secret: 'secret' };

    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);

    await dispatchWebhook(event, registration);

    expect(signPayload).toHaveBeenCalledWith(JSON.stringify(event));
  });
});